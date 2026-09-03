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

export const CARD_CONTENT_FIELDS = ['front', 'back', 'audio_id', 'card_type', 'dictation_answer'] as const;
export const AUDIO_CONTENT_FIELDS = ['name', 'file_path'] as const;

export function changedContent(remote: CardRow, local: CardRow, fields: readonly string[]) {
  return fields.some(field => (remote[field] ?? null) !== (local[field] ?? null));
}

export function contentDelta(remote: CardRow[], local: CardRow[], fields: readonly string[]) {
  const localById = new Map(local.map(row => [row.id, row]));
  const remoteIds = new Set(remote.map(row => row.id));
  return {
    added: remote.filter(row => !localById.has(row.id)).length,
    edited: remote.filter(row => localById.has(row.id) && changedContent(row, localById.get(row.id)!, fields)).length,
    removed: local.filter(row => !remoteIds.has(row.id)).length,
  };
}

export function cardIdsToFetch(metadata: CardRow[], local: CardRow[]) {
  const localById = new Map(local.map(row => [row.id, row]));
  return metadata.filter(row => {
    const saved = localById.get(row.id);
    if (!saved) return true;
    const remoteTime = Date.parse(String(row.updated_at || ''));
    const localTime = Date.parse(String(saved.updated_at || ''));
    return !Number.isFinite(remoteTime) || !Number.isFinite(localTime) || remoteTime !== localTime;
  }).map(row => row.id);
}

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
