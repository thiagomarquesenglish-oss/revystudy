import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCardsByDeck, getDeckAudios } from '@/lib/storage';
import { dictationAudioSource } from '@/lib/dictation';
import type { Flashcard } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import DictationExercise from '@/components/DictationExercise';
import { Button } from '@/components/ui/button';

interface Exercise { card: Flashcard; audioSrc: string }

export default function DictationPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, answered: 0, skipped: 0 });
  const [session, setSession] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(false); setIndex(0);
    setScore({ correct: 0, answered: 0, skipped: 0 });
    async function load() {
      if (!deckId) throw new Error('Baralho não encontrado');
      const cards = await getCardsByDeck(deckId);
      const candidates = cards.filter(card => card.dictationAnswer?.trim());
      const needsLinkedAudio = candidates.some(card => card.audioId && !dictationAudioSource(card.front + card.back));
      const audios = needsLinkedAudio ? await getDeckAudios(deckId) : [];
      const ready = candidates.flatMap(card => {
        let audioSrc = dictationAudioSource(card.front) || dictationAudioSource(card.back);
        const linked = audios.find(audio => audio.id === card.audioId);
        if (!audioSrc && linked) audioSrc = supabase.storage.from('deck-audios').getPublicUrl(linked.file_path).data.publicUrl;
        return audioSrc ? [{ card, audioSrc }] : [];
      });
      if (active) setItems(ready);
    }
    void load().catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deckId, retry]);

  const next = (correct?: boolean) => {
    setScore(previous => ({ correct: previous.correct + Number(correct === true),
      answered: previous.answered + Number(correct !== undefined), skipped: previous.skipped + Number(correct === undefined) }));
    setIndex(previous => previous + 1);
  };

  return <div className="min-h-screen bg-background safe-page">
    <PageHeader title="Ouvir e escrever" onBack={() => navigate(`/deck/${deckId}`)} />
    <main className="max-w-xl mx-auto px-4 pb-10 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
      <p className="text-xs text-muted-foreground">Prática livre · não altera suas revisões agendadas.</p>
      {loading ? <p role="status">Preparando ditado...</p> : error ? <div role="alert" className="space-y-4">
        <p>Não foi possível carregar os cartões.</p>
        <Button onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button>
      </div> : items.length === 0 ? <div className="rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-bold">Prepare seu primeiro ditado</h2>
        <p className="text-sm text-muted-foreground">Edite um cartão com áudio e preencha “Frase correta para o ditado” com a frase em inglês. Depois volte aqui para praticar.</p>
        <Button className="w-full" onClick={() => navigate(`/decks?deck=${deckId}`)}>Escolher cartão para editar</Button>
        <Button variant="outline" className="w-full" onClick={() => navigate(`/deck/${deckId}/add`)}>Criar cartão</Button>
      </div> : index >= items.length ? <div className="rounded-xl border border-border p-6 space-y-4" role="status">
        <h2 className="text-xl font-bold">Prática concluída!</h2>
        <p>{score.correct} de {score.answered} respostas corretas · {score.skipped} cartões pulados.</p>
        <Button className="w-full" onClick={() => { setIndex(0); setScore({ correct: 0, answered: 0, skipped: 0 }); setSession(value => value + 1); }}>Praticar novamente</Button>
        <Button variant="outline" className="w-full" onClick={() => navigate(`/deck/${deckId}`)}>Voltar ao baralho</Button>
      </div> : <>
        <p className="text-sm text-muted-foreground">Cartão {index + 1} de {items.length}</p>
        <DictationExercise key={`${session}-${items[index].card.id}`} {...items[index]} onNext={next} onSkip={() => next()} last={index === items.length - 1} />
      </>}
    </main>
  </div>;
}
