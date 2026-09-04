import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { FULL_BACKUP_FORMAT, inspectFullBackup } from '@/lib/full-backup';

vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{onAuthStateChange:vi.fn()},from:vi.fn()}}));
vi.mock('@/lib/storage',()=>({invalidateCache:vi.fn()}));

async function backupFile(overrides: Record<string, unknown> = {}) {
  const zip = new JSZip();
  zip.file('revystudy-backup.json', JSON.stringify({
    format: FULL_BACKUP_FORMAT,
    version: 1,
    generatedAt: '2026-09-01T12:00:00.000Z',
    sourceUserId: 'user-1',
    counts: { decks: 1, cards: 1, reviews: 1, audios: 0 },
    decks: [{ id: 'deck-1' }],
    cards: [{ id: 'card-1', deck_id: 'deck-1' }],
    reviewHistory: [{ id: 'review-1', card_id: 'card-1' }],
    deckAudios: [],
    embeddedMedia: [],
    preferences: { pinnedStats: [], lastStudySession: null },
    ...overrides,
  }));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], 'backup.revystudy.zip', { type: 'application/zip' });
}

describe('full backup validation', () => {
  it('accepts a coherent full snapshot with study history', async () => {
    const manifest = await inspectFullBackup(await backupFile());
    expect(manifest.counts).toEqual({ decks: 1, cards: 1, reviews: 1, audios: 0 });
    expect(manifest.reviewHistory[0].card_id).toBe('card-1');
  });

  it('rejects a snapshot whose declared counts do not match its contents', async () => {
    await expect(inspectFullBackup(await backupFile({
      counts: { decks: 1, cards: 2, reviews: 1, audios: 0 },
    }))).rejects.toThrow('conferência');
  });
});

it('round-trips dictation events while accepting older backups',async()=>{
  const event={id:'writing-1',user_id:'user-1',card_id:'card-1',deck_id:'deck-1',answer:'Hello',rating:'good',reviewed_at:'2026-09-01T12:00:00.000Z'};
  const manifest=await inspectFullBackup(await backupFile({dictationReviews:[event]}));
  expect(manifest.dictationReviews).toEqual([event]);
});
it('rejects orphaned and malformed writing history before restore',async()=>{
  const event={id:'writing-1',user_id:'user-1',card_id:'missing',deck_id:'deck-1',answer:'Hello',rating:'good',reviewed_at:'2026-09-01T12:00:00.000Z'};
  await expect(inspectFullBackup(await backupFile({dictationReviews:[event]}))).rejects.toThrow('escrita inválido');
  await expect(inspectFullBackup(await backupFile({dictationReviews:[{...event,card_id:'card-1',rating:'legacy',legacy:{reviews:-1}}]}))).rejects.toThrow('escrita inválido');
});
