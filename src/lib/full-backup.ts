import { getDictationEvents, pendingDictationCount, restoreDictationEvents, syncDictation } from './dictation-sync';
import { validDictationReview, type DictationReview } from './dictation-events';
import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { localDB, offlineQueue } from './offline-db';
import { invalidateCache } from './storage';
import { syncOfflineQueue } from './sync';
import { getPinnedStats } from './pinned-stats';

export const FULL_BACKUP_FORMAT = 'revystudy-full-backup';
export const FULL_BACKUP_VERSION = 1;

export type RestoreMode = 'merge' | 'replace';

interface EmbeddedMediaEntry {
  originalUrl: string;
  zipPath: string;
  contentType: string;
}

interface BackupAudioRow extends Record<string, unknown> {
  id: string;
  deck_id: string;
  file_path: string;
  backup_zip_path: string;
  backup_content_type: string;
}

export interface FullBackupManifest {
  format: typeof FULL_BACKUP_FORMAT;
  version: number;
  generatedAt: string;
  sourceUserId: string;
  counts: { decks: number; cards: number; reviews: number; audios: number };
  decks: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  reviewHistory: Record<string, unknown>[];
  deckAudios: BackupAudioRow[];
  embeddedMedia: EmbeddedMediaEntry[];
  dictationReviews?: DictationReview[];
  preferences: {
    pinnedStats: string[];
    lastStudySession: unknown;
  };
}

const PAGE_SIZE = 1000;

async function fetchAllRows(table: 'decks' | 'cards' | 'review_history' | 'deck_audios') {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function replaceEverywhere(value: string, search: string, replacement: string) {
  return value.split(search).join(replacement);
}

function extractMediaUrls(html: unknown): string[] {
  if (typeof html !== 'string') return [];
  const urls: string[] = [];
  const regex = /(?:src|data-src)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const value = match[1];
    if (value && !value.startsWith('{{MEDIA:')) urls.push(value);
  }
  return urls;
}

function extensionFor(contentType: string, url = ''): string {
  const normalized = contentType.split(';')[0].toLowerCase();
  const known: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
  };
  if (known[normalized]) return known[normalized];
  const cleanPath = url.split('?')[0];
  const candidate = cleanPath.includes('.') ? cleanPath.split('.').pop() : '';
  return candidate && /^[a-z0-9]{1,5}$/i.test(candidate) ? candidate : 'bin';
}

async function downloadRequired(url: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível incluir uma mídia no backup (${response.status}).`);
  return {
    data: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

function safeLocalStorageJson(key: string): unknown {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function createFullBackup(): Promise<Blob> {
  if (!navigator.onLine) throw new Error('Conecte-se à internet para criar um backup completo e conferido.');
  await syncOfflineQueue();
  if (await offlineQueue.count()) {
    throw new Error('Ainda existem alterações aguardando envio para a nuvem. Aguarde e tente novamente.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sua sessão expirou. Entre novamente.');
  await syncDictation();
  if (pendingDictationCount(user.id)) throw new Error('Existem revisões de escrita aguardando sincronização. Tente novamente.');

  const [decks, cardsInput, reviewHistory, audioInput] = await Promise.all([
    fetchAllRows('decks'),
    fetchAllRows('cards'),
    fetchAllRows('review_history'),
    fetchAllRows('deck_audios'),
  ]);

  const zip = new JSZip();
  const cards = cardsInput.map((row) => ({ ...row }));
  const uniqueMediaUrls = new Set<string>();
  cards.forEach((card) => {
    extractMediaUrls(card.front).forEach((url) => uniqueMediaUrls.add(url));
    extractMediaUrls(card.back).forEach((url) => uniqueMediaUrls.add(url));
  });

  const embeddedMedia: EmbeddedMediaEntry[] = [];
  let mediaIndex = 0;
  for (const originalUrl of uniqueMediaUrls) {
    const file = await downloadRequired(originalUrl);
    const path = `media/embedded/media_${mediaIndex++}.${extensionFor(file.contentType, originalUrl)}`;
    zip.file(path, file.data);
    embeddedMedia.push({ originalUrl, zipPath: path, contentType: file.contentType });
    cards.forEach((card) => {
      if (typeof card.front === 'string') card.front = replaceEverywhere(card.front, originalUrl, `{{MEDIA:${path}}}`);
      if (typeof card.back === 'string') card.back = replaceEverywhere(card.back, originalUrl, `{{MEDIA:${path}}}`);
    });
  }

  const deckAudios: BackupAudioRow[] = [];
  for (const row of audioInput) {
    const filePath = String(row.file_path || '');
    const { data } = supabase.storage.from('deck-audios').getPublicUrl(filePath);
    const file = await downloadRequired(data.publicUrl);
    const path = `media/deck-audios/${String(row.id)}.${extensionFor(file.contentType, filePath)}`;
    zip.file(path, file.data);
    deckAudios.push({
      ...(row as BackupAudioRow),
      id: String(row.id),
      deck_id: String(row.deck_id),
      file_path: filePath,
      backup_zip_path: path,
      backup_content_type: file.contentType,
    });
  }

  const manifest: FullBackupManifest = {
    format: FULL_BACKUP_FORMAT,
    version: FULL_BACKUP_VERSION,
    generatedAt: new Date().toISOString(),
    sourceUserId: user.id,
    counts: {
      decks: decks.length,
      cards: cards.length,
      reviews: reviewHistory.length,
      audios: deckAudios.length,
    },
    decks,
    cards,
    reviewHistory,
    deckAudios,
    embeddedMedia,
    dictationReviews: getDictationEvents(user.id),
    preferences: {
      pinnedStats: getPinnedStats(),
      lastStudySession: safeLocalStorageJson('memora-last-session'),
    },
  };

  zip.file('revystudy-backup.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function inspectFullBackup(file: File): Promise<FullBackupManifest> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file('revystudy-backup.json');
  if (!entry) throw new Error('Este arquivo não é um backup completo do RevyStudy.');
  const manifest = JSON.parse(await entry.async('text')) as FullBackupManifest;
  if (manifest.format !== FULL_BACKUP_FORMAT || manifest.version !== FULL_BACKUP_VERSION) {
    throw new Error('Versão de backup não reconhecida.');
  }
  if (!Array.isArray(manifest.decks) || !Array.isArray(manifest.cards) ||
      !Array.isArray(manifest.reviewHistory) || !Array.isArray(manifest.deckAudios) ||
      !Array.isArray(manifest.embeddedMedia)) {
    throw new Error('O backup está incompleto ou danificado.');
  }
  if (manifest.counts.decks !== manifest.decks.length ||
      manifest.counts.cards !== manifest.cards.length ||
      manifest.counts.reviews !== manifest.reviewHistory.length ||
      manifest.counts.audios !== manifest.deckAudios.length) {
    throw new Error('A conferência do backup falhou. Nenhum dado foi alterado.');
  }
  if (manifest.dictationReviews !== undefined && (!Array.isArray(manifest.dictationReviews) || manifest.dictationReviews.some(e => !validDictationReview(e) || !manifest.cards.some(c => c.id === e.card_id && c.deck_id === e.deck_id) || !manifest.decks.some(d => d.id === e.deck_id) || !['again','hard','good','easy','legacy'].includes(e.rating) || !Number.isFinite(Date.parse(e.reviewed_at)) || typeof e.answer !== 'string'))) throw new Error('Histórico de escrita inválido no backup.');
  return manifest;
}

type RestorableTable = 'decks' | 'cards' | 'review_history' | 'deck_audios';

interface UntypedUpsertTable {
  upsert: (rows: Record<string, unknown>[], options: { onConflict: string }) => PromiseLike<{ error: Error | null }>;
}

async function upsertInChunks(table: RestorableTable, rows: Record<string, unknown>[]) {
  for (let start = 0; start < rows.length; start += 100) {
    const target = supabase.from(table) as unknown as UntypedUpsertTable;
    const { error } = await target.upsert(rows.slice(start, start + 100), { onConflict: 'id' });
    if (error) throw error;
  }
}

async function uploadRestoredMedia(
  zip: JSZip,
  manifest: FullBackupManifest,
  userId: string,
): Promise<Map<string, string>> {
  const replacements = new Map<string, string>();
  for (const media of manifest.embeddedMedia || []) {
    const entry = zip.file(media.zipPath);
    if (!entry) throw new Error(`Mídia ausente no backup: ${media.zipPath}`);
    const extension = extensionFor(media.contentType, media.zipPath);
    const storagePath = `${userId}/restored/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from('card-media')
      .upload(storagePath, await entry.async('arraybuffer'), { contentType: media.contentType, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('card-media').getPublicUrl(storagePath);
    replacements.set(media.zipPath, data.publicUrl);
  }
  return replacements;
}

export async function restoreFullBackup(file: File, mode: RestoreMode) {
  if (!navigator.onLine) throw new Error('Conecte-se à internet para restaurar o backup.');
  await syncOfflineQueue();
  if (await offlineQueue.count()) {
    throw new Error('Existem alterações deste aparelho aguardando a nuvem. Aguarde antes de restaurar.');
  }

  const zip = await JSZip.loadAsync(file);
  const manifest = await inspectFullBackup(file);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sua sessão expirou. Entre novamente.');
  await syncDictation();
  if (pendingDictationCount(user.id)) throw new Error('Existem revisões de escrita aguardando sincronização. Tente novamente.');

  const mediaReplacements = await uploadRestoredMedia(zip, manifest, user.id);
  const restoredCards = manifest.cards.map((source) => {
    const card: Record<string, unknown> = { ...source, user_id: user.id };
    for (const [path, url] of mediaReplacements) {
      if (typeof card.front === 'string') card.front = replaceEverywhere(card.front, `{{MEDIA:${path}}}`, url);
      if (typeof card.back === 'string') card.back = replaceEverywhere(card.back, `{{MEDIA:${path}}}`, url);
    }
    return card;
  });

  const restoredAudios: Record<string, unknown>[] = [];
  for (const source of manifest.deckAudios || []) {
    const entry = zip.file(source.backup_zip_path);
    if (!entry) throw new Error(`Áudio ausente no backup: ${source.backup_zip_path}`);
    const extension = extensionFor(source.backup_content_type, source.backup_zip_path);
    const storagePath = `${user.id}/${source.deck_id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from('deck-audios')
      .upload(storagePath, await entry.async('arraybuffer'), {
        contentType: source.backup_content_type,
        upsert: false,
      });
    if (error) throw error;
    const { backup_zip_path: _zipPath, backup_content_type: _contentType, ...audio } = source;
    restoredAudios.push({ ...audio, file_path: storagePath, user_id: user.id });
  }

  let oldAudioPaths: string[] = [];
  if (mode === 'replace') {
    const { data: oldAudios } = await supabase.from('deck_audios').select('file_path');
    oldAudioPaths = (oldAudios || []).map((row) => row.file_path);
    for (const table of ['review_history', 'cards', 'deck_audios', 'decks'] as const) {
      const { error } = await supabase.from(table).delete().eq('user_id', user.id);
      if (error) throw error;
    }
  }

  const decks = manifest.decks.map(({ card_count: _cards, audio_count: _audios, ...deck }) => ({
    ...deck,
    user_id: user.id,
  }));
  const reviews = manifest.reviewHistory.map((row) => ({ ...row, user_id: user.id }));

  await upsertInChunks('decks', decks);
  await upsertInChunks('deck_audios', restoredAudios);
  await upsertInChunks('cards', restoredCards);
  await upsertInChunks('review_history', reviews);
  restoreDictationEvents(user.id, manifest.dictationReviews || [], mode === 'replace');
  await syncDictation();
  if (pendingDictationCount(user.id)) throw new Error('O histórico de escrita permanece salvo neste aparelho, aguardando envio.');

  if (mode === 'replace' && oldAudioPaths.length) {
    await supabase.storage.from('deck-audios').remove(oldAudioPaths);
  }

  if (Array.isArray(manifest.preferences?.pinnedStats)) {
    localStorage.setItem('memora-pinned-stats', JSON.stringify(manifest.preferences.pinnedStats));
  }
  if (manifest.preferences?.lastStudySession) {
    localStorage.setItem('memora-last-session', JSON.stringify(manifest.preferences.lastStudySession));
  }
  localStorage.setItem('revystudy-last-restore', new Date().toISOString());
  await localDB.clearForFullRestore();
  invalidateCache();

  return manifest.counts;
}

export function downloadFullBackup(blob: Blob, generatedAt = new Date()) {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(generatedAt);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `revystudy-backup-${stamp}.revystudy.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  localStorage.setItem('revystudy-last-local-backup', new Date().toISOString());
}
