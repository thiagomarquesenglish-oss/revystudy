/** Same direct network path validated on the iPhone. Never persist this URL in a card. */
export function cloudMediaUrl(src: string): string {
  if (!/^https?:\/\//i.test(src)) return src; // Keep unsaved upload previews/embedded imports intact.
  const url = new URL(src);
  // Older installed service workers already treat this marker as NetworkOnly.
  url.searchParams.set('revystudy_download', crypto.randomUUID());
  return url.href;
}

/** Remove only the obsolete downloaded-media copy, never cards, outbox or backups. */
export async function removeLegacyMediaDownloads(): Promise<void> {
  try { localStorage.removeItem('revystudy:offline-media-enabled'); } catch { /* restricted storage */ }
  if ('caches' in globalThis) await caches.delete('revystudy-media-v1');
}
