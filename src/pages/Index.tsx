import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ArrowRight, Play, Plus } from 'lucide-react';
import { getDecks, getNewCards, getLearningCards, getReviewCards } from '@/lib/storage';
import type { Deck } from '@/lib/types';
import { useTabVisible } from '@/hooks/useTabVisible';
import StreakBadge from '@/components/StreakBadge';

import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

export default function Index() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadData = useCallback(async () => {
    try {
      setError(false);
      const items = await getDecks();
      const totals = await Promise.all(items.map(async deck => {
        const lists = await Promise.all([getNewCards(deck.id), getLearningCards(deck.id), getReviewCards(deck.id)]);
        return [deck.id, lists.reduce((sum, list) => sum + list.length, 0)] as const;
      }));
      setDecks(items); setCounts(Object.fromEntries(totals));
    } catch { setError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);
  useTabVisible('/', loadData);
  let remembered = '';
  try { remembered = localStorage.getItem('revystudy:last-deck') || ''; } catch { /* optional preference */ }
  const last = decks.find(deck => deck.id === remembered) || decks.find(deck => counts[deck.id] > 0) || decks[0];
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return <div className="min-h-screen bg-background safe-bottom">
    <PageHeader title="Hoje" rightContent={<StreakBadge />} />
    <main className="max-w-3xl mx-auto px-4 space-y-7 pb-6" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1.5rem)' }}>
      {loading ? <p role="status" className="text-muted-foreground">Preparando seu estudo...</p>
        : error ? <div role="alert" className="space-y-3"><p>Não foi possível carregar seus baralhos.</p><Button onClick={loadData}>Tentar novamente</Button></div>
        : !last ? <section className="rounded-3xl border border-border bg-card p-7 space-y-4">
          <BookOpen className="h-10 w-10 text-primary" /><h1 className="text-2xl font-bold">Seu inglês começa aqui</h1>
          <p className="text-muted-foreground">Reúna frases, imagens e áudios em um baralho para começar a praticar.</p>
          <Button onClick={() => navigate('/library/manage')}><Plus />Criar meu primeiro baralho</Button>
        </section> : <>
          <section className="py-3 space-y-5">
            <p className="text-sm text-muted-foreground capitalize">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="native-title">{total > 0 ? 'Vamos estudar.' : 'Tudo em dia.'}</h1>
            <p className="text-muted-foreground">{total > 0 ? `${total} ${total === 1 ? 'cartão disponível' : 'cartões disponíveis'} para estudar agora.` : 'Revisões em dia. Você pode continuar com uma prática livre.'}</p>
            <div className="flex items-center gap-3 text-muted-foreground"><BookOpen className="text-primary shrink-0" /><span className="font-semibold break-words min-w-0">{last.name}</span></div>
            <Button className="w-full" size="lg" onClick={() => navigate(counts[last.id] > 0 ? `/study/${last.id}` : `/deck/${last.id}`)}><Play />{counts[last.id] > 0 ? 'Começar revisão' : 'Abrir baralho'}</Button>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Seus baralhos</h2><Button variant="ghost" size="sm" onClick={() => navigate('/decks')}>Ver biblioteca<ArrowRight /></Button></div>
            <div className="native-list">{decks.map(deck => <button key={deck.id} onClick={() => navigate(`/deck/${deck.id}`)} className="native-row">
              <span className="rounded-xl bg-secondary p-2"><BookOpen className="h-5 w-5 text-primary" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold truncate">{deck.name}</span><span className="block text-sm text-muted-foreground mt-1">{counts[deck.id] > 0 ? `${counts[deck.id]} para estudar agora` : 'Revisões em dia · prática livre disponível'}</span></span><ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </button>)}</div>
          </section>

        </>}
    </main><BottomNav active="home" />
  </div>;
}
