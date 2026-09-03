import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { CardStatus, Deck } from './types';
import {
  getCardsByDeck,
  addDeck,
  addCardsWithProgressBulk,
  deleteDeck,
  getDeckAudios,
  DeckAudio,
  invalidateCache,
} from './storage';

interface LegacyDeckCard {
  dictationAnswer?: string | null;
  front: string;
  back: string;
  audioId?: string | null;
  status?: string;
  interval?: number;
  easeFactor?: number;
  stepsIndex?: number;
  repetition?: number;
  reviewCount?: number;
  lapseCount?: number;
}

interface LegacyDeckAudio {
  id: string;
  name: string;
  zipPath: string | null;
}

interface LegacyDeckManifest {
  version: number;
  deck: { name: string; description?: string };
  cards: LegacyDeckCard[];
  audios?: LegacyDeckAudio[];
}

export interface DeckImportInspection {
  deckName: string;
  cardCount: number;
  imageCount: number;
  embeddedAudioCount: number;
  historicalReviewCount: number;
  hasDatedReviewHistory: false;
}

export type DeckImportResult = DeckImportInspection;

const VALID_CARD_STATUSES = new Set<CardStatus>(['new', 'learning', 'review', 'relearning']);
const DATA_MEDIA_PATTERN = /data:((?:audio|image)\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)/gi;
const MEDIA_PLACEHOLDER_PATTERN = /\{\{MEDIA:([^}]+)\}\}/g;

// ── Helpers ──

function replaceAllOccurrences(str: string, search: string, replacement: string): string {
  return str.split(search).join(replacement);
}

function extractImageUrls(html: string): string[] {
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  const urls: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

async function downloadFile(url: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return { data, contentType };
  } catch {
    return null;
  }
}

function getExtFromContentType(ct: string): string {
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3', 'audio/mp4': 'mp4', 'audio/wav': 'wav',
    'audio/ogg': 'ogg', 'audio/webm': 'webm',
  };
  return map[ct] || 'bin';
}

function getContentTypeFromPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg', m4a: 'audio/mp4',
    mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm',
  };
  return map[extension || ''] || 'application/octet-stream';
}

function safeNumber(value: unknown, fallback: number, minimum = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

function safeInteger(value: unknown, fallback: number, minimum = 0): number {
  return Math.trunc(safeNumber(value, fallback, minimum));
}

function getMediaPlaceholders(cards: LegacyDeckCard[]): Set<string> {
  const paths = new Set<string>();
  for (const card of cards) {
    for (const html of [card.front, card.back]) {
      MEDIA_PLACEHOLDER_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MEDIA_PLACEHOLDER_PATTERN.exec(html)) !== null) paths.add(match[1]);
    }
  }
  return paths;
}

function getEmbeddedDataMedia(cards: LegacyDeckCard[]): Map<string, string> {
  const media = new Map<string, string>();
  for (const card of cards) {
    for (const html of [card.front, card.back]) {
      DATA_MEDIA_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = DATA_MEDIA_PATTERN.exec(html)) !== null) media.set(match[0], match[1].toLowerCase());
    }
  }
  return media;
}

function decodeBase64DataUri(value: string): Uint8Array {
  DATA_MEDIA_PATTERN.lastIndex = 0;
  const match = DATA_MEDIA_PATTERN.exec(value);
  if (!match || match[0] !== value) throw new Error('Uma mídia embutida no ZIP está danificada.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function sanitizeImportedHtml(html: string): string {
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  document.querySelectorAll('script,iframe,object,embed,form,base,meta,link').forEach((node) => node.remove());
  document.body.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' ||
          ((name === 'src' || name === 'href' || name === 'xlink:href') && /^(?:javascript|vbscript):/.test(value)) ||
          (name === 'style' && /(?:expression\s*\(|javascript\s*:)/.test(value))) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return document.body.innerHTML;
}

async function loadLegacyDeckBackup(file: File): Promise<{ zip: JSZip; manifest: LegacyDeckManifest }> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Arquivo inválido: manifest.json não encontrado.');

  let manifest: LegacyDeckManifest;
  try {
    manifest = JSON.parse(await manifestFile.async('text')) as LegacyDeckManifest;
  } catch {
    throw new Error('Arquivo inválido: o conteúdo do backup está danificado.');
  }

  if (manifest.version !== 1 || !manifest.deck || typeof manifest.deck.name !== 'string' ||
      !Array.isArray(manifest.cards) || manifest.cards.length === 0 ||
      manifest.cards.some((card) => typeof card?.front !== 'string' || typeof card?.back !== 'string')) {
    throw new Error('Arquivo inválido: formato de baralho não reconhecido.');
  }
  if (manifest.cards.length > 50_000) throw new Error('Este arquivo possui cartões demais para uma única importação.');
  if (manifest.audios && !Array.isArray(manifest.audios)) throw new Error('A lista de áudios do backup está danificada.');

  for (const path of getMediaPlaceholders(manifest.cards)) {
    if (!path.startsWith('media/') || !zip.file(path)) throw new Error(`Mídia ausente no ZIP: ${path}`);
  }
  for (const audio of manifest.audios || []) {
    if (audio.zipPath && (!audio.zipPath.startsWith('media/') || !zip.file(audio.zipPath))) {
      throw new Error(`Áudio ausente no ZIP: ${audio.zipPath}`);
    }
  }
  return { zip, manifest };
}

function summarizeLegacyDeckManifest(manifest: LegacyDeckManifest): DeckImportInspection {
  const placeholders = getMediaPlaceholders(manifest.cards);
  const embedded = getEmbeddedDataMedia(manifest.cards);
  return {
    deckName: manifest.deck.name,
    cardCount: manifest.cards.length,
    imageCount: [...placeholders].filter((path) => getContentTypeFromPath(path).startsWith('image/')).length,
    embeddedAudioCount: [...embedded.values()].filter((type) => type.startsWith('audio/')).length,
    historicalReviewCount: manifest.cards.reduce((sum, card) => sum + safeInteger(card.reviewCount, 0), 0),
    hasDatedReviewHistory: false,
  };
}

export async function inspectDeckBackup(file: File): Promise<DeckImportInspection> {
  const { manifest } = await loadLegacyDeckBackup(file);
  return summarizeLegacyDeckManifest(manifest);
}

// ── Export ──

export async function exportDeckAsZip(deck: Deck): Promise<Blob> {
  const zip = new JSZip();
  const cards = await getCardsByDeck(deck.id);
  const audios = await getDeckAudios(deck.id);

  // Collect all image URLs from cards
  const imageUrlMap = new Map<string, string>();
  let imageIdx = 0;

  for (const card of cards) {
    for (const html of [card.front, card.back]) {
      const urls = extractImageUrls(html);
      for (const url of urls) {
        if (!imageUrlMap.has(url)) {
          const file = await downloadFile(url);
          if (file) {
            const ext = getExtFromContentType(file.contentType);
            const path = `media/images/img_${imageIdx++}.${ext}`;
            zip.file(path, file.data);
            imageUrlMap.set(url, path);
          }
        }
      }
    }
  }

  // Download and include deck audios
  const audioPathMap = new Map<string, string>();
  for (const audio of audios) {
    const { data: urlData } = supabase.storage.from('deck-audios').getPublicUrl(audio.file_path);
    const file = await downloadFile(urlData.publicUrl);
    if (file) {
      const ext = getExtFromContentType(file.contentType);
      const path = `media/audios/${audio.id}.${ext}`;
      zip.file(path, file.data);
      audioPathMap.set(audio.id, path);
    }
  }

  // Replace image URLs in card HTML with placeholders
  const exportCards = cards.map(card => {
    let front = card.front;
    let back = card.back;
    for (const [url, path] of imageUrlMap) {
      front = replaceAllOccurrences(front, url, `{{MEDIA:${path}}}`);
      back = replaceAllOccurrences(back, url, `{{MEDIA:${path}}}`);
    }
    return { ...card, front, back };
  });

  // Build manifest
  const manifest = {
    version: 1,
    deck: { name: deck.name, description: deck.description },
    cards: exportCards.map(c => ({
      front: c.front,
      back: c.back,
      audioId: c.audioId,
      dictationAnswer: c.dictationAnswer || null,
      status: c.status,
      interval: c.interval,
      easeFactor: c.easeFactor,
      stepsIndex: c.stepsIndex,
      repetition: c.repetition,
      reviewCount: c.reviewCount,
      lapseCount: c.lapseCount,
    })),
    audios: audios.map(a => ({
      id: a.id,
      name: a.name,
      zipPath: audioPathMap.get(a.id) || null,
    })),
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

// ── Import ──

export async function importDeckFromZip(file: File): Promise<DeckImportResult> {
  if (!navigator.onLine) throw new Error('Conecte-se à internet para importar imagens e áudios.');
  const { zip, manifest } = await loadLegacyDeckBackup(file);
  const inspection = summarizeLegacyDeckManifest(manifest);
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Sua sessão expirou. Entre novamente.');

  let newDeck: Deck | null = null;
  const uploadedCardMedia: string[] = [];
  const uploadedDeckAudios: string[] = [];

  try {
    newDeck = await addDeck(manifest.deck.name, manifest.deck.description || '');
    const mediaUrlMap = new Map<string, string>();

    const uploadCardMedia = async (data: ArrayBuffer | Uint8Array, contentType: string, extension: string) => {
      if (data.byteLength > 25 * 1024 * 1024) throw new Error('Uma mídia do ZIP ultrapassa o limite de 25 MB.');
      const storagePath = `${userId}/legacy-import/${newDeck!.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from('card-media').upload(storagePath, data, {
        contentType,
        upsert: false,
      });
      if (error) throw error;
      uploadedCardMedia.push(storagePath);
      return supabase.storage.from('card-media').getPublicUrl(storagePath).data.publicUrl;
    };

    for (const path of getMediaPlaceholders(manifest.cards)) {
      const entry = zip.file(path);
      if (!entry) throw new Error(`Mídia ausente no ZIP: ${path}`);
      const contentType = getContentTypeFromPath(path);
      const extension = path.split('.').pop()?.toLowerCase() || getExtFromContentType(contentType);
      mediaUrlMap.set(path, await uploadCardMedia(await entry.async('arraybuffer'), contentType, extension));
    }

    for (const [dataUri, contentType] of getEmbeddedDataMedia(manifest.cards)) {
      mediaUrlMap.set(dataUri, await uploadCardMedia(
        decodeBase64DataUri(dataUri),
        contentType,
        getExtFromContentType(contentType),
      ));
    }

    const audioIdMap = new Map<string, string>();
    for (const audioMeta of manifest.audios || []) {
      if (!audioMeta.zipPath) continue;
      const audioFile = zip.file(audioMeta.zipPath);
      if (!audioFile) throw new Error(`Áudio ausente no ZIP: ${audioMeta.zipPath}`);
      const audioData = await audioFile.async('arraybuffer');
      if (audioData.byteLength > 25 * 1024 * 1024) throw new Error('Um áudio do ZIP ultrapassa o limite de 25 MB.');
      const contentType = getContentTypeFromPath(audioMeta.zipPath);
      const extension = audioMeta.zipPath.split('.').pop()?.toLowerCase() || getExtFromContentType(contentType);
      const storagePath = `${userId}/${newDeck.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('deck-audios').upload(storagePath, audioData, {
        contentType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedDeckAudios.push(storagePath);

      const { data: inserted, error: insertError } = await supabase.from('deck_audios').insert({
        deck_id: newDeck.id,
        name: audioMeta.name || 'Áudio importado',
        file_path: storagePath,
        user_id: userId,
      }).select('id').single();
      if (insertError) throw insertError;
      audioIdMap.set(audioMeta.id, inserted.id);
    }

    const dueDate = new Date().toISOString();
    const cards = manifest.cards.map((source) => {
      let front = source.front;
      let back = source.back;
      for (const [reference, url] of mediaUrlMap) {
        const search = reference.startsWith('data:') ? reference : `{{MEDIA:${reference}}}`;
        front = replaceAllOccurrences(front, search, url);
        back = replaceAllOccurrences(back, search, url);
      }
      const status = VALID_CARD_STATUSES.has(source.status as CardStatus)
        ? source.status as CardStatus
        : 'new';
      return {
        front: sanitizeImportedHtml(front),
        back: sanitizeImportedHtml(back),
        audioId: source.audioId ? audioIdMap.get(source.audioId) || null : null,
        dictationAnswer: typeof source.dictationAnswer === 'string' ? source.dictationAnswer.trim() || null : null,
        status,
        interval: safeNumber(source.interval, 0),
        easeFactor: safeNumber(source.easeFactor, 2.5, 1.3),
        stepsIndex: safeInteger(source.stepsIndex, 0),
        repetition: safeInteger(source.repetition, 0),
        reviewCount: safeInteger(source.reviewCount, 0),
        lapseCount: safeInteger(source.lapseCount, 0),
        dueDate,
      };
    });

    await addCardsWithProgressBulk(newDeck.id, cards);
    invalidateCache();
    return inspection;
  } catch (error) {
    if (uploadedCardMedia.length) await supabase.storage.from('card-media').remove(uploadedCardMedia);
    if (uploadedDeckAudios.length) await supabase.storage.from('deck-audios').remove(uploadedDeckAudios);
    if (newDeck) await deleteDeck(newDeck.id).catch(() => undefined);
    throw error;
  }
}
