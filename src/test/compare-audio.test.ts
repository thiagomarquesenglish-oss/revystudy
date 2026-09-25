import { expect, it, vi, afterEach } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { compareAudio, sameAudioBytes } from '@/lib/compare-audio';
import { readSavedAudio } from '@/lib/saved-audio';
vi.mock('@/lib/saved-audio', () => ({ readSavedAudio: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
it('detects byte and length differences', () => {
  expect(sameAudioBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  expect(sameAudioBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
  expect(sameAudioBytes(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
});
it('compares without writing or exposing the source URL', async () => {
  const blob = new NodeBlob(['ID3test'], { type: 'audio/mpeg' }) as unknown as Blob;
  vi.mocked(readSavedAudio).mockResolvedValue(blob);
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, type: 'cors', blob: async () => blob })));
  const result = await compareAudio('https://example.com/private.mp3');
  expect(result.identical).toBe(true);
  expect(result.localSignature).toBe('ID3');
  expect(JSON.stringify(result)).not.toContain('private');
});
