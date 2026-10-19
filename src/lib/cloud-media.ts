import { migrateMediaReferences } from '../../shared/backend-config.js';
/** Stable media URLs let the browser reuse downloaded bytes without manual downloads. */
export function cloudMediaUrl(src: string): string {
  if (!/^https?:\/\//i.test(src)) return src; // Keep unsaved upload previews/embedded imports intact.
  const url = new URL(migrateMediaReferences(src));
  // Older installed service workers already treat this marker as NetworkOnly.
  url.searchParams.set('revystudy_download', 'cloud-v2');
  return url.href;
}

/** Remove only the obsolete downloaded-media copy, never cards, outbox or backups. */
export async function removeLegacyMediaDownloads(): Promise<void> {
  try { localStorage.removeItem('revystudy:offline-media-enabled'); } catch { /* restricted storage */ }
  if ('caches' in globalThis) await caches.delete('revystudy-media-v1');
}
