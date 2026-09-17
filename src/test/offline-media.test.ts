import { describe, expect, it, vi } from 'vitest';
import { cacheMediaUrls, collectMediaUrls, resolveOfflineMediaUrl } from '@/lib/offline-media';

describe('offline media', () => {
  it('repairs an opaque worker entry through a unique CORS download and stores readable bytes at the original URL', async () => {
    const url = 'https://cdn.test/repair.mp3';
    let stored: Response | undefined;
    const put = vi.fn(async (_key: string, response: Response) => { stored = response; });
    vi.stubGlobal('caches', { open: vi.fn(async () => ({
      match: vi.fn(async () => stored?.clone() || { status: 0, type: 'opaque' }), put,
    })) });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      // Simulate the old CacheFirst worker rejecting a CORS request for its opaque entry.
      if (String(input) === url) throw new TypeError('Response served by service worker is opaque');
      return new Response(new Blob(['audio'], { type: 'audio/mpeg' }));
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:repaired') });
    try {
      await expect(cacheMediaUrls([url])).resolves.toBe(1);
      expect(new URL(String(fetchSpy.mock.calls[0][0])).searchParams.has('revystudy_download')).toBe(true);
      expect(fetchSpy.mock.calls[0][1]).toMatchObject({ mode: 'cors', cache: 'no-store' });
      expect(put.mock.calls[0][0]).toBe(url);
      expect(stored?.status).toBe(200);
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      await expect(resolveOfflineMediaUrl(url)).resolves.toBe('blob:repaired');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      delete (URL as any).createObjectURL;
    }
  });

  it('collects unique images and audio from card content', () => {
    const urls = collectMediaUrls([
      { front: '<img src="https://cdn.test/image.jpg"><div data-audio data-src="https://cdn.test/audio.mp3"></div>', back: '<img src="https://cdn.test/image.jpg">' },
      { front: '<audio src="https://cdn.test/second.mp3"></audio>', back: '<p>answer</p>' },
    ], []);
    expect(urls).toEqual(['https://cdn.test/image.jpg', 'https://cdn.test/audio.mp3', 'https://cdn.test/second.mp3']);
  });

  it('ignores inline and relative assets that are already local', () => {
    expect(collectMediaUrls([{ front: '<img src="data:image/png;base64,abc"><img src="/icon.png">' }], [])).toEqual([]);
  });

  it('turns a downloaded audio into a local blob URL for playback', async () => {
    localStorage.setItem('revystudy:offline-media-enabled', 'false');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network must not be used'));
    const response = new Response(new Blob(['audio'], { type: 'audio/mpeg' }));
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ match: vi.fn(async () => response) })) });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:local-audio') });
    await expect(resolveOfflineMediaUrl('https://cdn.test/local.mp3')).resolves.toBe('blob:local-audio');
    expect(fetchSpy).not.toHaveBeenCalled();
    localStorage.removeItem('revystudy:offline-media-enabled');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (URL as any).createObjectURL;
  });

  it('reports a missing offline file instead of silently returning a cloud URL', async () => {
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ match: vi.fn(async () => undefined) })) });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(resolveOfflineMediaUrl('https://cdn.test/missing.mp3')).rejects.toThrow('não está salvo');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
