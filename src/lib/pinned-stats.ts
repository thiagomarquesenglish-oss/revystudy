const PINNED_KEY = 'memora-pinned-stats';

export type StatSectionId = 
  | 'overview'
  | 'daily-chart'
  | 'card-distribution'
  | 'forecast'
  | 'per-deck'
  | 'learned-cards';

export const STAT_SECTION_LABELS: Record<StatSectionId, string> = {
  'overview': 'Visão geral',
  'daily-chart': 'Últimos 30 dias',
  'card-distribution': 'Distribuição de cartões',
  'forecast': 'Previsão de revisões',
  'per-deck': 'Por baralho',
  'learned-cards': 'Cartões aprendidos',
};

export function getPinnedStats(): StatSectionId[] {
  const data = localStorage.getItem(PINNED_KEY);
  return data ? JSON.parse(data) : [];
}

export function togglePinnedStat(id: StatSectionId): StatSectionId[] {
  const current = getPinnedStats();
  const updated = current.includes(id)
    ? current.filter(s => s !== id)
    : [...current, id];
  localStorage.setItem(PINNED_KEY, JSON.stringify(updated));
  return updated;
}

export function isStatPinned(id: StatSectionId): boolean {
  return getPinnedStats().includes(id);
}
