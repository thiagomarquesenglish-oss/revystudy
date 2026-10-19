import { afterEach, expect, it, vi } from 'vitest';
import { cloudMediaUrl, removeLegacyMediaDownloads } from '@/lib/cloud-media';
import { CLOUD_BACKEND_URL, migrateMediaReferences } from '../../shared/backend-config.js';
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('reuses stable cloud URLs without changing the stored URL or signed parameters', () => {
  const src = 'https://example.com/a.mp3?token=abc';
  const first = new URL(cloudMediaUrl(src));
  expect(first.searchParams.get('token')).toBe('abc');
  expect(first.searchParams.get('revystudy_download')).toBeTruthy();
  expect(cloudMediaUrl(src)).toBe(first.href);
  expect(src).toBe('https://example.com/a.mp3?token=abc');
  expect(cloudMediaUrl('blob:unsaved-preview')).toBe('blob:unsaved-preview');
});
it('redirects legacy card media to Cloudflare, including cards cached before migration',()=>{
  const old='https://paomzgkwglvshrztebni.supabase.co/storage/v1/object/public/card-media/user/audio.mp3';
  expect(cloudMediaUrl(old)).toBe(CLOUD_BACKEND_URL+'/storage/v1/object/public/card-media/user/audio.mp3?revystudy_download=cloud-v2');
  expect(migrateMediaReferences(`<img src="${old}">`)).toContain(CLOUD_BACKEND_URL);
  expect(migrateMediaReferences('https://example.com/image.png')).toBe('https://example.com/image.png');
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
