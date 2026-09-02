export interface DeckManifestSnapshot {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  content_updated_at: string;
  card_count: number;
  audio_count: number;
}

export const PROGRESS_FIELDS = [
  'status',
  'interval',
  'ease_factor',
  'steps_index',
  'repetition',
  'review_count',
  'lapse_count',
  'due_date',
  'flagged',
  'progress_updated_at',
] as const;

type CardRow = Record<string, unknown> & { id: string };

function timestamp(row: CardRow): number {
  const value = row.progress_updated_at || row.updated_at || row.created_at;
  const parsed = typeof value === 'string' ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeDownloadedCardRows(remoteRows: CardRow[], localRows: CardRow[]) {
  const localById = new Map(localRows.map((row) => [row.id, row]));
  const localProgressRows: CardRow[] = [];

  const rows = remoteRows.map((remote) => {
    const local = localById.get(remote.id);
    if (!local || timestamp(local) <= timestamp(remote)) return remote;

    const merged: CardRow = { ...remote };
    for (const field of PROGRESS_FIELDS) {
      if (local[field] !== undefined) merged[field] = local[field];
    }
    localProgressRows.push(merged);
    return merged;
  });

  return {
    rows,
    localProgressRows,
    removedLocalOnlyCount: localRows.filter((row) => !remoteRows.some((remote) => remote.id === row.id)).length,
  };
}

export function assertCompletePackage(
  before: DeckManifestSnapshot,
  after: DeckManifestSnapshot,
  cardRows: CardRow[],
  audioRows: CardRow[],
) {
  if (before.content_updated_at !== after.content_updated_at) {
    throw new Error('O baralho mudou durante o download');
  }

  const uniqueCardIds = new Set(cardRows.map((row) => row.id));
  const uniqueAudioIds = new Set(audioRows.map((row) => row.id));
  if (cardRows.length !== after.card_count || uniqueCardIds.size !== after.card_count) {
    throw new Error(`Pacote incompleto: esperado ${after.card_count} cartões e recebidos ${uniqueCardIds.size}`);
  }
  if (audioRows.length !== after.audio_count || uniqueAudioIds.size !== after.audio_count) {
    throw new Error(`Pacote incompleto: esperado ${after.audio_count} áudios e recebidos ${uniqueAudioIds.size}`);
  }
}
