import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StreakBadge from '@/components/StreakBadge';
import SyncUpdatesButton from '@/components/SyncUpdatesButton';
import { useTabVisible } from '@/hooks/useTabVisible';
import { getDecks, getLocalDeckCounts } from '@/lib/storage';
import { Deck } from '@/lib/types';
import { BookOpen } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import Heatmap from '@/components/Heatmap';
import PinnedStats from '@/components/PinnedStats';
import PageTransition from '@/components/PageTransition';

export default function Index() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckCounts, setDeckCounts] = useState<Record<string, { new: number; learning: number; review: number }>>({});
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const fetchedDecks = await getDecks();
      setDecks(fetchedDecks);

      setDeckCounts(await getLocalDeckCounts());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  useTabVisible('/', useCallback(() => { loadData(); }, []));

  if (loading) {
    return (
      <div className="min-h-screen bg-background safe-bottom">
        <PageHeader title="Início" rightContent={<><SyncUpdatesButton onInstalled={loadData} /><StreakBadge /></>} />
        <main className="max-w-3xl mx-auto px-3 py-4 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="px-3 sm:px-4 py-2 border-b border-border">
              <Skeleton className="h-4 w-full" />
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-6 px-3 sm:px-4 py-3 border-b border-border last:border-b-0">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </main>
        <BottomNav active="home" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background safe-bottom">
      <PageHeader title="Início" rightContent={<><SyncUpdatesButton onInstalled={loadData} /><StreakBadge /></>} />
      
      <PageTransition>
      <main className="max-w-3xl mx-auto px-3 py-4 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>
        {decks.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-14 h-14 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-display font-semibold text-lg mb-1">Comece sua jornada!</h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Crie seu primeiro baralho na aba Configurações para começar a estudar.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div
                className="flex items-center px-3 sm:px-4 py-2 border-b border-border font-semibold text-muted-foreground uppercase tracking-wider"
                style={{ gap: '30px', fontSize: '12px' }}
              >
                <div className="flex-1 min-w-0 font-bold text-foreground">Baralho</div>
                <div className="w-16 sm:w-20 text-center shrink-0 font-bold text-foreground">Novo</div>
                <div className="w-16 sm:w-20 text-center shrink-0 font-bold text-foreground"><span className="-ml-3 sm:ml-0">Aprendendo</span></div>
                <div className="w-16 sm:w-20 text-center shrink-0 font-bold text-foreground">Revisar</div>
              </div>

              {decks.map((deck) => {
                const counts = deckCounts[deck.id] || { new: 0, learning: 0, review: 0 };
                return (
                  <div
                    key={deck.id}
                    className="flex items-center px-3 sm:px-4 py-3 border-b border-border last:border-b-0 bg-background hover:bg-secondary/50 transition-colors cursor-pointer"
                    style={{ gap: '30px' }}
                    onClick={() => navigate(`/deck/${deck.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-base sm:text-sm font-medium truncate">{deck.name}</p>
                    </div>
                    <div className="w-16 sm:w-20 text-center shrink-0">
                      <span className={`text-[13px] font-bold ${counts.new > 0 ? 'text-col-new' : 'text-muted-foreground/40'}`}>
                        {counts.new}
                      </span>
                    </div>
                    <div className="w-16 sm:w-20 text-center shrink-0">
                      <span className={`text-[13px] font-bold ${counts.learning > 0 ? 'text-col-learning' : 'text-muted-foreground/40'}`}>
                        {counts.learning}
                      </span>
                    </div>
                    <div className="w-16 sm:w-20 text-center shrink-0">
                      <span className={`text-[13px] font-bold ${counts.review > 0 ? 'text-col-review' : 'text-muted-foreground/40'}`}>
                        {counts.review}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <Heatmap />

            <PinnedStats />
          </>
        )}
      </main>
      </PageTransition>
      

      <BottomNav active="home" />
    </div>
  );
}
