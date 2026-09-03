import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Music, Plus, Repeat } from 'lucide-react';
import { getDecks, getDeckAudios, invalidateDeckAudios } from '@/lib/storage';
import type { DeckAudio } from '@/lib/storage';
import type { Deck } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import DeckAudioPlayer from '@/components/DeckAudioPlayer';
import type { DeckAudioPlayerHandle } from '@/components/DeckAudioPlayer';
import CreateDeckAudioDrawer from '@/components/CreateDeckAudioDrawer';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function DeckAudiosPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [audios, setAudios] = useState<DeckAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');
  const [autoPlay, setAutoPlay] = useState(false);
  const playerRefs = useRef<(DeckAudioPlayerHandle | null)[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setDeck(null);
    setAudios([]);
    Promise.all([getDecks(), getDeckAudios(deckId!)]).then(([decks, items]) => {
      if (!active) return;
      setDeck(decks.find(item => item.id === deckId) || null);
      setAudios(items);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [deckId]);

  const loadAudios = useCallback(async () => {
    if (!deckId) return;
    try {
      invalidateDeckAudios(deckId);
      setAudios(await getDeckAudios(deckId));
    } catch {
      toast.error('Não foi possível atualizar as reproduções. Reabra esta página para tentar novamente.');
    }
  }, [deckId]);

  return (
    <div className="min-h-screen bg-background safe-page">
      <PageHeader title="Reproduções" onBack={() => navigate(`/deck/${deckId}`)} />
      <main className="max-w-3xl mx-auto px-3 space-y-6 pb-8" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        {loading ? <p className="text-sm text-muted-foreground">Carregando reproduções...</p> : error ? (
          <p role="alert" className="text-sm text-muted-foreground">Não foi possível carregar as reproduções. Volte ao baralho e tente novamente.</p>
        ) : !deck ? <p className="text-muted-foreground">Baralho não encontrado.</p> : (
          <>
            <div className="space-y-2">
              <h1 className="text-xl font-bold break-words">{deck.name}</h1>
              <p className="text-sm text-muted-foreground">Ouça os textos e áudios deste baralho.</p>
            </div>
            <Button className="w-full gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Criar reprodução
            </Button>
            {audios.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
                <Music className="h-10 w-10 mx-auto text-muted-foreground" />
                <h2 className="font-bold">Nenhuma reprodução ainda</h2>
                <p className="text-sm text-muted-foreground">Toque em “Criar reprodução”, escolha um nome e adicione seu arquivo de áudio.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-muted-foreground">Seus áudios ({audios.length})</h2>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Repeat className="h-4 w-4" /> Em sequência
                    <Switch aria-label="Reproduzir áudios em sequência" checked={autoPlay} onCheckedChange={setAutoPlay} />
                  </label>
                </div>
                {audios.map((audio, index) => (
                  <DeckAudioPlayer key={audio.id} audio={audio}
                    ref={el => { playerRefs.current[index] = el; }}
                    onDeleted={loadAudios}
                    onEnded={() => { if (autoPlay) playerRefs.current[index + 1]?.play(); }}
                  />
                ))}
              </div>
            )}
            <CreateDeckAudioDrawer key={deckId} open={createOpen} onOpenChange={setCreateOpen} deckId={deckId!} onCreated={loadAudios} />
          </>
        )}
      </main>
    </div>
  );
}
