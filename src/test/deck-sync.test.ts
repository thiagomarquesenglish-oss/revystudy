import { describe, expect, it } from 'vitest';
import { assertCompletePackage, mergeDownloadedCardRows } from '@/lib/deck-sync';

const manifest = {
  id: 'deck-1',
  name: 'English',
  description: '',
  created_at: '2026-01-01T00:00:00.000Z',
  content_updated_at: '2026-09-01T10:00:00.000Z',
  card_count: 1,
  audio_count: 1,
};

describe('deck package synchronization', () => {
  it('uses cloud content while preserving newer phone progress', () => {
    const remote = [{
      id: 'card-1', front: 'new cloud text', back: 'answer', status: 'new',
      review_count: 0, flagged: false, progress_updated_at: '2026-09-01T09:00:00.000Z',
    }];
    const local = [{
      id: 'card-1', front: 'old local text', back: 'old answer', status: 'review',
      review_count: 7, flagged: true, progress_updated_at: '2026-09-01T11:00:00.000Z',
    }];

    const result = mergeDownloadedCardRows(remote, local);
    expect(result.rows[0]).toMatchObject({
      front: 'new cloud text',
      back: 'answer',
      status: 'review',
      review_count: 7,
      flagged: true,
    });
    expect(result.localProgressRows).toHaveLength(1);
  });

  it('keeps newer cloud progress and removes stale phone-only content', () => {
    const remote = [{ id: 'card-1', front: 'cloud', status: 'review', review_count: 9, progress_updated_at: '2026-09-01T12:00:00.000Z' }];
    const local = [
      { id: 'card-1', front: 'local', status: 'new', review_count: 0, progress_updated_at: '2026-09-01T08:00:00.000Z' },
      { id: 'stale-card', front: 'stale', progress_updated_at: '2026-09-01T08:00:00.000Z' },
    ];

    const result = mergeDownloadedCardRows(remote, local);
    expect(result.rows).toEqual(remote);
    expect(result.removedLocalOnlyCount).toBe(1);
    expect(result.localProgressRows).toHaveLength(0);
  });

  it('accepts only a stable package with exact unique counts', () => {
    expect(() => assertCompletePackage(manifest, manifest, [{ id: 'card-1' }], [{ id: 'audio-1' }])).not.toThrow();
    expect(() => assertCompletePackage(manifest, manifest, [], [{ id: 'audio-1' }])).toThrow(/Pacote incompleto/);
    expect(() => assertCompletePackage(
      manifest,
      { ...manifest, content_updated_at: '2026-09-01T10:01:00.000Z' },
      [{ id: 'card-1' }],
      [{ id: 'audio-1' }],
    )).toThrow(/mudou durante o download/);
  });
});
