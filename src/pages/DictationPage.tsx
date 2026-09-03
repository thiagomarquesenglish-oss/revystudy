import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCardsByDeck, getDeckAudios } from '@/lib/storage';
import { dictationAudioSource } from '@/lib/dictation';
import { dueDictation, intervalLabel, progressFor, readDictationHistory, saveDictationHistory, scheduleDictation, shuffleDictation, type DictationHistory, type DictationRating } from '@/lib/dictation-srs';
import type { Flashcard } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import DictationExercise from '@/components/DictationExercise';
import { Button } from '@/components/ui/button';

interface Exercise { card: Flashcard; audioSrc: string }
const emptyScore = { correct: 0, answered: 0, skipped: 0 };

export default function DictationPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [all, setAll] = useState<Exercise[]>([]);
  const [items, setItems] = useState<Exercise[]>([]);
  const [history, setHistory] = useState<DictationHistory>({});
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(emptyScore);
  const [session, setSession] = useState(0);
  const [extra, setExtra] = useState(false);
  const attempts = useRef<Record<string, number>>({});
  const advancing = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(false); setSaveError(false); setIndex(0); setScore(emptyScore); setExtra(false);
    attempts.current = {};
    async function load() {
      if (!deckId) throw new Error('Baralho não encontrado');
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth?.user) throw new Error('Entre na sua conta');
      const stored = readDictationHistory(auth.user.id, deckId);
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
      if (active) { setAll(ready); setItems(dueDictation(ready, stored)); setHistory(stored); setUserId(auth.user.id); }
    }
    void load().catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deckId, retry]);

  useEffect(() => { advancing.current = false; }, [index, session, retry]);
  const next = (correct?: boolean, rating?: DictationRating) => {
    if (advancing.current || !items[index]) return;
    advancing.current = true;
    const item = items[index];
    if (correct !== undefined && !extra) {
      try {
        // Read again so another open practice does not erase unrelated answers.
        const latest = readDictationHistory(userId, deckId!);
        const updated = { ...latest, [item.card.id]: scheduleDictation(progressFor(item.card, latest), item.card.dictationAnswer!, correct ? rating ?? 'good' : 'again') };
        saveDictationHistory(userId, deckId!, updated);
        setHistory(updated); setSaveError(false);
      } catch { setSaveError(true); advancing.current = false; return; }
    }
    attempts.current[item.card.id] = (attempts.current[item.card.id] ?? 0) + 1;
    if (correct === false && attempts.current[item.card.id] < 3) {
      setItems(previous => {
        const queue = [...previous];
        queue.splice(Math.min(index + 4, queue.length), 0, item);
        return queue;
      });
    }
    setScore(previous => ({ correct: previous.correct + Number(correct === true), answered: previous.answered + Number(correct !== undefined), skipped: previous.skipped + Number(correct === undefined) }));
    setIndex(previous => previous + 1);
  };
  const startExtra = () => {
    setItems(shuffleDictation(all)); setIndex(0); setScore(emptyScore); setExtra(true);
    setSession(value => value + 1); attempts.current = {}; setSaveError(false);
  };
  const current = items[index];
  const intervals = current ? Object.fromEntries((['hard', 'good', 'easy'] as const).map(rating => [rating,
    intervalLabel(scheduleDictation(progressFor(current.card, history), current.card.dictationAnswer!, rating))])) : {};
  const futureDue = all.map(({ card }) => progressFor(card, history)?.due).filter((due): due is number => !!due && due > Date.now());
  const nextDue = futureDue.length ? Math.min(...futureDue) : undefined;

  return <div className="min-h-screen bg-background safe-page">
    <PageHeader title="Ouvir e escrever" onBack={() => navigate(`/deck/${deckId}`)} />
    <main className="max-w-xl mx-auto px-4 pb-10 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Como funcionam as revisões?</summary><p className="mt-2">Os erros voltam nesta sessão, até três tentativas, e ficam para revisar em 10 minutos. Os acertos recebem intervalos maiores conforme sua avaliação. O ditado tem progresso próprio, salvo neste navegador e separado dos cartões. A prática extra não muda os agendamentos.</p></details>
      {loading ? <p role="status">Preparando ditado...</p> : error ? <div role="alert" className="space-y-4">
        <p>Não foi possível carregar os cartões ou o histórico de ditado.</p><Button onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button>
      </div> : all.length === 0 ? <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-bold">Prepare seu primeiro ditado</h2>
        <p className="text-sm text-muted-foreground">Edite um cartão com áudio e preencha “Frase correta para o ditado” com a frase em inglês. Depois volte aqui para praticar.</p>
        <Button className="w-full" onClick={() => navigate(`/decks?deck=${deckId}`)}>Escolher cartão para editar</Button>
        <Button variant="outline" className="w-full" onClick={() => navigate(`/deck/${deckId}/add`)}>Criar cartão</Button>
      </div> : !current ? <div className="rounded-xl border border-border bg-card p-6 space-y-4" role="status">
        <h2 className="text-xl font-bold">{extra ? 'Prática extra concluída!' : items.length ? 'Sessão concluída!' : 'Tudo em dia no ditado!'}</h2>
        {score.answered > 0 && <p>{score.correct} de {score.answered} tentativas corretas.</p>}
        {score.skipped > 0 && <p>{score.skipped} frases puladas, sem alterar a revisão.</p>}
        {nextDue && <p className="text-sm text-muted-foreground">Próxima revisão: {new Date(nextDue).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.</p>}
        <Button className="w-full" onClick={() => setRetry(value => value + 1)}>Verificar revisões pendentes</Button>
        <Button variant="outline" className="w-full" onClick={startExtra}>Praticar mais</Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate(`/deck/${deckId}`)}>Voltar ao baralho</Button>
      </div> : <>
        <p className="text-sm text-muted-foreground">{extra ? 'Prática extra' : 'Revisão de escrita'} · Frase {index + 1} de {items.length}</p>
        {saveError && <p role="alert" className="text-sm text-destructive">Não foi possível salvar sua revisão. Libere espaço no navegador e tente a avaliação novamente.</p>}
        <DictationExercise key={`${session}-${index}-${current.card.id}`} {...current} onNext={next} onSkip={() => next()} last={index === items.length - 1} ratings={!extra} intervals={intervals} />
      </>}
    </main>
  </div>;
}
