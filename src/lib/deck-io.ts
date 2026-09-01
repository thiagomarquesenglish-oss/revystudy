import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { Deck, Flashcard } from './types';
import { getCardsByDeck, addDeck, addCard, getDeckAudios, DeckAudio, invalidateCache } from './storage';

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

export async function importDeckFromZip(file: File): Promise<{ deckName: string; cardCount: number }> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Arquivo inválido: manifest.json não encontrado');

  const manifest = JSON.parse(await manifestFile.async('text'));
  if (!manifest.version || !manifest.deck || !manifest.cards) {
    throw new Error('Arquivo inválido: formato não reconhecido');
  }

  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Não autenticado');

  // Create the deck
  const newDeck = await addDeck(manifest.deck.name, manifest.deck.description || '');

  // Upload audios and map old IDs to new IDs
  const audioIdMap = new Map<string, string>();
  for (const audioMeta of (manifest.audios || [])) {
    if (!audioMeta.zipPath) continue;
    const audioFile = zip.file(audioMeta.zipPath);
    if (!audioFile) continue;

    const audioData = await audioFile.async('arraybuffer');
    const ext = audioMeta.zipPath.split('.').pop() || 'mp3';
    const storagePath = `${userId}/${newDeck.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('deck-audios')
      .upload(storagePath, audioData, { contentType: `audio/${ext === 'mp3' ? 'mpeg' : ext}` });

    if (uploadError) {
      console.error('Failed to upload audio:', uploadError);
      continue;
    }

    const { data: insertData, error: insertError } = await supabase
      .from('deck_audios')
      .insert({ deck_id: newDeck.id, name: audioMeta.name, file_path: storagePath, user_id: userId })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to insert audio record:', insertError);
      continue;
    }

    audioIdMap.set(audioMeta.id, insertData.id);
  }

  // Process images from zip → base64 data URLs
  const mediaUrlMap = new Map<string, string>();
  const imageFiles: { path: string; file: JSZip.JSZipObject }[] = [];
  zip.folder('media/images')?.forEach((relativePath, file) => {
    imageFiles.push({ path: `media/images/${relativePath}`, file });
  });

  for (const { path, file } of imageFiles) {
    const data = await file.async('arraybuffer');
    const ext = path.split('.').pop() || 'png';
    const base64 = btoa(
      new Uint8Array(data).reduce((str, byte) => str + String.fromCharCode(byte), '')
    );
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    };
    const mime = mimeMap[ext] || 'image/png';
    mediaUrlMap.set(path, `data:${mime};base64,${base64}`);
  }

  // Create cards with updated references
  for (const cardData of manifest.cards) {
    let front = cardData.front as string;
    let back = cardData.back as string;

    for (const [zipPath, url] of mediaUrlMap) {
      const placeholder = `{{MEDIA:${zipPath}}}`;
      front = replaceAllOccurrences(front, placeholder, url);
      back = replaceAllOccurrences(back, placeholder, url);
    }

    const newAudioId = cardData.audioId ? (audioIdMap.get(cardData.audioId) || null) : null;
    await addCard(newDeck.id, front, back, newAudioId);
  }

  invalidateCache();
  return { deckName: newDeck.name, cardCount: manifest.cards.length };
}
