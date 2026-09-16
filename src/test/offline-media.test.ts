import { describe, expect, it } from 'vitest';
import { collectMediaUrls } from '@/lib/offline-media';

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
});
