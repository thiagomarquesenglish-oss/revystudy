import { describe, expect, it } from 'vitest';
import { cardIdsToFetch, contentDelta, CARD_CONTENT_FIELDS, AUDIO_CONTENT_FIELDS } from '@/lib/deck-sync';

describe('incremental deck updates', () => {
  const local = Array.from({ length: 28 }, (_, n) => ({
    id: `card-${n}`, front: `phrase ${n}`, back: 'translation',
    updated_at: '2026-09-03T08:00:00.000Z', review_count: 4,
  }));

  it('adding one audio requires no existing card bodies or card changes', () => {
    const metadata = local.map(({ id, updated_at }) => ({ id, updated_at }));
    expect(cardIdsToFetch(metadata, local)).toEqual([]);
    expect(contentDelta(local, local, CARD_CONTENT_FIELDS)).toEqual({ added: 0, edited: 0, removed: 0 });
    const oldAudio = { id: 'a', name: 'Old', file_path: 'a.mp3' };
    expect(contentDelta([oldAudio, { id: 'b', name: 'New', file_path: 'b.mp3' }], [oldAudio], AUDIO_CONTENT_FIELDS))
      .toEqual({ added: 1, edited: 0, removed: 0 });
  });

  it('compares IDs and contents, not total counts', () => {
    const remote = [...local.slice(1), { ...local[0], id: 'new-card' }];
    expect(cardIdsToFetch(remote, local)).toEqual(['new-card']);
    expect(contentDelta(remote, local, CARD_CONTENT_FIELDS)).toEqual({ added: 1, edited: 0, removed: 1 });
    expect(contentDelta([{ ...local[0], front: 'edited' }, ...local.slice(1)], local, CARD_CONTENT_FIELDS).edited).toBe(1);
  });

  it('does not present study progress as new content', () => {
    const remote = local.map(row => ({ ...row, review_count: 0, status: 'new' }));
    expect(contentDelta(remote, local, CARD_CONTENT_FIELDS)).toEqual({ added: 0, edited: 0, removed: 0 });
  });

  it('normalizes timestamp formats and checks changed or missing versions', () => {
    expect(cardIdsToFetch([{ id: 'card-0', updated_at: '2026-09-03T08:00:00+00:00' }], local)).toEqual([]);
    expect(cardIdsToFetch([{ id: 'card-0', updated_at: '2026-09-03T09:00:00Z' }, { id: 'card-1' }], local))
      .toEqual(['card-0', 'card-1']);
  });

  it('detects replaced audio and changed dictation answers', () => {
    expect(contentDelta([{ id: 'a', name: 'Audio', file_path: 'new.mp3' }], [{ id: 'a', name: 'Audio', file_path: 'old.mp3' }], AUDIO_CONTENT_FIELDS).edited).toBe(1);
    expect(contentDelta([{ ...local[0], dictation_answer: 'Hello' }], [local[0]], CARD_CONTENT_FIELDS).edited).toBe(1);
  });
});
