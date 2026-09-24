import { afterEach, expect, it, vi } from 'vitest';
import { cloudMediaUrl, removeLegacyMediaDownloads } from '@/lib/cloud-media';
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('creates fresh direct-network URLs without changing the stored URL or signed parameters', () => {
  const src = 'https://example.com/a.mp3?token=abc';
  const first = new URL(cloudMediaUrl(src));
  expect(first.searchParams.get('token')).toBe('abc');
  expect(first.searchParams.get('revystudy_download')).toBeTruthy();
  expect(cloudMediaUrl(src)).not.toBe(first.href);
  expect(src).toBe('https://example.com/a.mp3?token=abc');
  expect(cloudMediaUrl('blob:unsaved-preview')).toBe('blob:unsaved-preview');
});
it('deletes only the legacy downloaded-media cache and preference, leaving other data alone', async () => {
  const remove = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('caches', { delete: remove });
  localStorage.setItem('revystudy:offline-media-enabled', 'true');
  localStorage.setItem('other-data', 'keep');
  await removeLegacyMediaDownloads();
  expect(remove).toHaveBeenCalledExactlyOnceWith('revystudy-media-v1');
  expect(localStorage.getItem('revystudy:offline-media-enabled')).toBeNull();
  expect(localStorage.getItem('other-data')).toBe('keep');
});
