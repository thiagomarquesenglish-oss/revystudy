import { describe, expect, it, vi } from 'vitest';
import { collectMediaUrls, resolveOfflineMediaUrl } from '@/lib/offline-media';

describe('offline media', () => {
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
