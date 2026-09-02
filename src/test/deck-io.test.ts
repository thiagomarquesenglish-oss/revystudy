import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { inspectDeckBackup, sanitizeImportedHtml } from '@/lib/deck-io';

async function legacyDeckFile(options: { includeImage?: boolean } = {}) {
  const zip = new JSZip();
  if (options.includeImage !== false) zip.file('media/images/img_0.png', new Uint8Array([137, 80, 78, 71]));
  zip.file('manifest.json', JSON.stringify({
    version: 1,
    deck: { name: 'Baralho antigo', description: '' },
    cards: [
      {
        front: '<img src="{{MEDIA:media/images/img_0.png}}">',
        back: '<audio src="data:audio/mpeg;base64,SUQz"></audio>',
        status: 'review',
        interval: 3,
        easeFactor: 2.5,
        stepsIndex: 0,
        repetition: 2,
        reviewCount: 4,
        lapseCount: 1,
      },
      {
        front: 'Hello',
        back: 'Olá',
        status: 'review',
        reviewCount: 3,
      },
    ],
    audios: [],
  }));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], 'legacy.zip', { type: 'application/zip' });
}

describe('legacy deck backup compatibility', () => {
  it('recognizes media and accumulated study progress', async () => {
    const result = await inspectDeckBackup(await legacyDeckFile());
    expect(result).toMatchObject({
      deckName: 'Baralho antigo',
      cardCount: 2,
      imageCount: 1,
      embeddedAudioCount: 1,
      historicalReviewCount: 7,
      hasDatedReviewHistory: false,
    });
  });

  it('rejects a backup with missing referenced media', async () => {
    await expect(inspectDeckBackup(await legacyDeckFile({ includeImage: false })))
      .rejects.toThrow('Mídia ausente');
  });

  it('removes executable markup while preserving study content', () => {
    const clean = sanitizeImportedHtml('<p onclick="steal()">Hello</p><script>steal()</script><a href="javascript:steal()">link</a>');
    expect(clean).toContain('<p>Hello</p>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript:');
  });
});
