import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadLearningData } from '@/lib/learning-data';
import { readSituation } from '@/lib/situation';
import { availableSituationModes, exerciseInfo, type ExerciseMode } from '@/lib/adaptive-study';
import type { Flashcard, Rating } from '@/lib/types';
import StudyCard from '@/components/StudyCard';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

type PracticeKind = 'random' | 'listening' | 'production' | 'dictation';
type Exercise = { card: Flashcard; mode: ExerciseMode };

export function practiceOptions(card: Flashcard, kind: PracticeKind): ExerciseMode[] {
  const situation = readSituation(card.front, card.back);
  if (!situation) return [];
  const root = document.createElement('div');
  root.innerHTML = situation.mediaHtml;
  return availableSituationModes({
    hasImage: !!root.querySelector('img[src]'),
    hasAudio: !!card.audioId || !!root.querySelector('audio[src],[data-audio][data-src]'),
    hasEnglish: !!situation.english.trim(), hasPortuguese: !!situation.portuguese.trim(),
  }).filter(mode => kind === 'random' || (kind === 'dictation' ? mode === 'audio-dictation' : exerciseInfo[mode].skill === kind));
}

export function buildPractice(cards: Flashcard[], kind: PracticeKind, limit: number): Exercise[] {
  const eligible = cards.flatMap(card => {
    const modes = practiceOptions(card, kind);
    return modes.length ? [{ card, mode: modes[Math.floor(Math.random() * modes.length)] }] : [];
  });
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  return eligible.slice(0, limit);
}

export default function FreePracticePage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<PracticeKind>('random');
  const [limit, setLimit] = useState(10);
  const [session, setSession] = useState<Exercise[] | null>(null);
  const [position, setPosition] = useState(0);
  const [results, setResults] = useState<Rating[]>([]);
  const answered = useRef(-1);
  useEffect(() => {
    let active = true;
    loadLearningData().then(data => { if (active) setCards(data.cards.filter(c => !deckId || c.deckId === deckId)); })
      .catch(() => { if (active) setError('Não foi possível carregar os conteúdos. Volte e tente novamente.'); });
    return () => { active = false; };
  }, [deckId]);
  const eligible = cards?.filter(card => practiceOptions(card, kind).length).length || 0;
  const current = session?.[position];
  const rate = (rating: Rating) => {
    if (answered.current === position) return;
    answered.current = position;
    setResults(old => [...old, rating]);
    setPosition(old => old + 1);
  };
  return <div className="min-h-screen bg-background safe-page">
    <PageHeader title="Treino livre" onBack={() => navigate(deckId ? `/deck/${deckId}` : '/stats')} />
    <main className="max-w-3xl mx-auto px-4 space-y-5" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
      {!session ? <>
        <p className="text-sm text-muted-foreground">Pratique quando quiser. Este treino não muda as revisões agendadas nem libera etapas.</p>
        {error ? <p role="alert">{error}</p> : cards === null ? <p role="status">Carregando conteúdos…</p> : <>
          <label className="block space-y-2">O que treinar<select className="block w-full rounded-xl border bg-background p-3" value={kind} onChange={e => setKind(e.target.value as PracticeKind)}><option value="random">Aleatório</option><option value="listening">Escuta</option><option value="production">Produção em inglês</option><option value="dictation">Ditado — ouvir e escrever</option></select></label>
          <p className="text-sm text-muted-foreground">{kind === 'dictation' ? 'Ouça o áudio e escreva. A correção usa a frase em inglês cadastrada.' : kind === 'production' ? 'Fale em inglês e confira a resposta por autoavaliação.' : 'Cada situação aparece uma vez por sessão, com uma modalidade disponível.'}</p>
          <label className="block space-y-2">Quantidade de exercícios<select className="block w-full rounded-xl border bg-background p-3" value={limit} onChange={e => setLimit(Number(e.target.value))}>{[5,10,20,30].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <p className="text-sm">{eligible} situações disponíveis. A sessão terá até {Math.min(limit, eligible)} exercícios.</p>
          {!eligible && <p className="text-sm text-muted-foreground">Adicione situações com os materiais necessários. Escuta e ditado precisam de áudio e frase em inglês.</p>}
          <Button disabled={!eligible} onClick={() => { answered.current = -1; setPosition(0); setResults([]); setSession(buildPractice(cards,kind,limit)); }}>Começar treino</Button>
        </>}
      </> : current ? <>
        <p className="text-center text-sm text-muted-foreground">Treino livre · {position + 1} de {session.length}</p>
        <StudyCard key={`${current.card.id}-${position}`} card={current.card} forcedMode={current.mode} onRate={rate} remainingNew={0} remainingLearning={0} remainingReview={session.length-position} />
      </> : <div className="text-center space-y-4 py-8"><h2 className="text-2xl font-bold">Treino concluído</h2><p>{results.length} exercícios · {results.filter(r => r === 'good' || r === 'easy').length} respostas avaliadas como boas ou fáceis.</p><p className="text-sm text-muted-foreground">Suas revisões agendadas e o progresso do currículo continuam iguais.</p><Button onClick={() => setSession(null)}>Escolher outro treino</Button></div>}
    </main>
  </div>;
}
