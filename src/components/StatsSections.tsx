import { useMemo, useState, useEffect } from 'react';
import { getCards, getDecks, getReviewHistory } from '@/lib/storage';
import { Flashcard, Deck } from '@/lib/types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function getDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getDateStr(d);
}

function useStatsData() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [reviewHistory, setReviewHistory] = useState<{ date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCards(), getDecks(), getReviewHistory()]).then(([c, d, h]) => {
      setCards(c);
      setDecks(d);
      setReviewHistory(h);
      setLoading(false);
    }).catch(console.error);
  }, []);

  const todayStr = getDateStr(new Date());
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);

  const todayCount = reviewHistory.find(r => r.date === todayStr)?.count || 0;
  const weekCount = reviewHistory.filter(r => r.date >= weekAgo).reduce((s, r) => s + r.count, 0);
  const monthCount = reviewHistory.filter(r => r.date >= monthAgo).reduce((s, r) => s + r.count, 0);

  const statusCounts = useMemo(() => {
    const counts = { new: 0, learning: 0, review: 0, relearning: 0 };
    cards.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return counts;
  }, [cards]);

  const totalReviews = cards.reduce((sum, c) => sum + c.reviewCount, 0);
  const totalLapses = cards.reduce((sum, c) => sum + c.lapseCount, 0);
  const retentionRate = totalReviews > 0 ? Math.round(((totalReviews - totalLapses) / totalReviews) * 100) : 0;

  const maxInDay = useMemo(() => {
    return Math.max(0, ...reviewHistory.map(r => r.count));
  }, [reviewHistory]);

  return { cards, decks, todayStr, weekAgo, monthAgo, todayCount, weekCount, monthCount, statusCounts, totalReviews, totalLapses, retentionRate, maxInDay, reviewHistory, loading };
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[hsl(var(--heatmap-empty))] rounded-lg p-3 sm:p-4 text-center">
      <p className="text-lg sm:text-xl font-bold">{value}</p>
      <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

export function OverviewSection() {
  const { cards, decks, todayCount, weekCount, monthCount, retentionRate, maxInDay, totalReviews, loading } = useStatsData();
  if (loading) return <p className="text-muted-foreground text-sm">Carregando...</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      <StatBlock label="Total de cartões" value={cards.length} />
      <StatBlock label="Total de baralhos" value={decks.length} />
      <StatBlock label="Estudados hoje" value={todayCount} />
      <StatBlock label="Esta semana" value={weekCount} />
      <StatBlock label="Este mês" value={monthCount} />
      <StatBlock label="Taxa de retenção" value={`${retentionRate}%`} />
      <StatBlock label="Recorde em 1 dia" value={maxInDay} />
      <StatBlock label="Total de revisões" value={totalReviews} />
    </div>
  );
}

export function DailyChartSection() {
  const { reviewHistory, loading } = useStatsData();
  const monthAgo = daysAgo(30);

  const dailyActivity = useMemo(() => {
    const countMap: Record<string, number> = {};
    reviewHistory.forEach(r => {
      if (r.date >= monthAgo) countMap[r.date] = r.count;
    });
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const ds = daysAgo(i);
      const d = new Date(ds);
      days.push({ date: ds, label: d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }), count: countMap[ds] || 0 });
    }
    return days;
  }, [reviewHistory, monthAgo]);

  if (loading || !dailyActivity.some(d => d.count > 0)) return null;

  return (
    <div className="bg-card rounded-lg border border-border p-3 sm:p-4">
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={dailyActivity}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(0 0% 55%)' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(0 0% 18%)', border: '1px solid hsl(0 0% 24%)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'hsl(0 0% 85%)' }}
            itemStyle={{ color: 'hsl(0 0% 85%)' }}
            formatter={(value: number) => [`${value} cartões`, 'Estudados']}
          />
          <Bar dataKey="count" fill="#247e25" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CardDistributionSection() {
  const { cards, statusCounts, loading } = useStatsData();

  const total = cards.length;

  // "Recentes" = review cards with interval < 21 days, "Maduros" = interval >= 21 days
  const recentCount = cards.filter(c => c.status === 'review' && c.interval < 21).length;
  const matureCount = cards.filter(c => c.status === 'review' && c.interval >= 21).length;

  const rows = [
    { name: 'Novos', value: statusCounts.new, color: '#4A90D9' },
    { name: 'Aprendendo', value: statusCounts.learning, color: '#D9943A' },
    { name: 'Reaprendendo', value: statusCounts.relearning, color: '#C44E47' },
    { name: 'Recentes', value: recentCount, color: '#5DB85D' },
    { name: 'Maduros', value: matureCount, color: '#2E7D2E' },
  ];

  const pieData = rows.filter(d => d.value > 0);
  const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;

  if (loading) return null;

  return (
    <div className="bg-card rounded-lg border border-border p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
      <PieChart width={120} height={120}>
        <Pie data={pieData.length > 0 ? pieData : [{ name: 'Vazio', value: 1, color: 'hsl(0 0% 20%)' }]} dataKey="value" cx="50%" cy="50%" outerRadius={55} strokeWidth={0} isAnimationActive={false}>
          {(pieData.length > 0 ? pieData : [{ color: 'hsl(0 0% 20%)' }]).map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
      </PieChart>
      <div className="flex-1 w-full">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(r => (
              <tr key={r.name}>
                <td className="py-0.5 pr-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="text-foreground">{r.name}</span>
                  </div>
                </td>
                <td className="py-0.5 text-right tabular-nums text-foreground font-medium w-12">{r.value}</td>
                <td className="py-0.5 text-right tabular-nums text-muted-foreground w-14">{pct(r.value)}%</td>
              </tr>
            ))}
            <tr className="border-t border-border">
              <td className="py-1 pr-2 text-muted-foreground">Total de cartões</td>
              <td className="py-1 text-right tabular-nums text-foreground font-medium">{total}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ForecastSection() {
  const { cards, loading } = useStatsData();

  const forecast = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds = getDateStr(d);
      const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' });
      const count = cards.filter(c => c.status === 'review' && c.dueDate.slice(0, 10) === ds).length;
      days.push({ date: ds, label, count });
    }
    return days;
  }, [cards]);

  if (loading || !forecast.some(d => d.count > 0)) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-7">
      {forecast.map(d => (
        <div key={d.date} className="bg-card rounded-lg border border-border p-2 text-center min-w-[4.5rem] sm:min-w-0 shrink-0 sm:shrink">
          <p className="text-xs text-muted-foreground whitespace-nowrap">{d.label}</p>
          <p className="text-lg font-bold">{d.count}</p>
        </div>
      ))}
    </div>
  );
}

export function PerDeckSection() {
  const { cards, decks, loading } = useStatsData();

  const deckStats = useMemo(() => {
    return decks.map(deck => {
      const deckCards = cards.filter(c => c.deckId === deck.id);
      const newCount = deckCards.filter(c => c.status === 'new').length;
      const learningCount = deckCards.filter(c => c.status === 'learning' || c.status === 'relearning').length;
      const reviewCount = deckCards.filter(c => c.status === 'review').length;
      const totalReviews = deckCards.reduce((s, c) => s + c.reviewCount, 0);
      const totalLapses = deckCards.reduce((s, c) => s + c.lapseCount, 0);
      const retention = totalReviews > 0 ? Math.round(((totalReviews - totalLapses) / totalReviews) * 100) : 0;
      return { ...deck, total: deckCards.length, newCount, learningCount, reviewCount, retention };
    });
  }, [cards, decks]);

  if (loading || deckStats.length === 0) return null;

  return (
    <div className="space-y-2">
      {deckStats.map(d => (
        <div key={d.id} className="bg-card rounded-lg border border-border p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm truncate">{d.name}</p>
            <span className="text-xs text-muted-foreground shrink-0 ml-2">{d.total} cartões</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Novo: <strong className="text-foreground">{d.newCount}</strong></span>
            <span>Aprendendo: <strong className="text-foreground">{d.learningCount}</strong></span>
            <span>Revisão: <strong className="text-foreground">{d.reviewCount}</strong></span>
            <span>Retenção: <strong className="text-foreground">{d.retention}%</strong></span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LearnedCardsSection() {
  const { cards, decks, loading } = useStatsData();

  const learnedCards = useMemo(() => {
    return cards
      .filter(c => c.status === 'review' && c.easeFactor >= 2.5 && c.interval >= 21)
      .sort((a, b) => b.interval - a.interval);
  }, [cards]);

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  if (loading) return <p className="text-muted-foreground text-sm">Carregando...</p>;

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">Cartões com alta taxa de acerto e intervalo de revisão longo (21+ dias).</p>
      {learnedCards.length === 0 ? (
        <div className="bg-[hsl(var(--heatmap-empty))] rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhum cartão aprendido ainda. Continue estudando!</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">{learnedCards.length} {learnedCards.length === 1 ? 'cartão aprendido' : 'cartões aprendidos'}</p>
          <div className="bg-card rounded-lg border border-border divide-y divide-border max-h-80 overflow-y-auto">
            {learnedCards.slice(0, 50).map(c => {
              const deckName = decks.find(d => d.id === c.deckId)?.name || '';
              return (
                <div key={c.id} className="px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{stripHtml(c.front)}</p>
                    <p className="text-xs text-muted-foreground truncate">{deckName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium">{c.interval}d</p>
                    <p className="text-xs text-muted-foreground">Ease: {c.easeFactor.toFixed(1)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
