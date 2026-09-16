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
    localStorage.setItem('revystudy:offline-media-enabled', 'true');
    const response = new Response(new Blob(['audio'], { type: 'audio/mpeg' }));
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ match: vi.fn(async () => response) })) });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:local-audio') });
    await expect(resolveOfflineMediaUrl('https://cdn.test/local.mp3')).resolves.toBe('blob:local-audio');
    localStorage.removeItem('revystudy:offline-media-enabled');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (URL as any).createObjectURL;
  });
});
