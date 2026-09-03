import { useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { compareDictation } from '@/lib/dictation';
import type { Flashcard } from '@/lib/types';
import { sanitizeImportedHtml } from '@/lib/deck-io';

export default function DictationExercise({ card, audioSrc, onNext, onSkip, last }: {
  card: Flashcard; audioSrc: string; onNext: (correct: boolean) => void; onSkip: () => void; last: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<ReturnType<typeof compareDictation> | null>(null);
  const [audioError, setAudioError] = useState(false);

  const play = () => {
    if (!audio.current) return;
    setAudioError(false);
    audio.current.currentTime = 0;
    void audio.current.play().catch(() => setAudioError(true));
  };
  const check = () => {
    if (!typed.trim() || result) return;
    audio.current?.pause();
    setResult(compareDictation(card.dictationAnswer || '', typed));
  };

  // The original content is only mounted after checking, never hidden in the prompt DOM.
  const reveal = () => {
    const doc = new DOMParser().parseFromString(sanitizeImportedHtml(card.front + card.back), 'text/html');
    doc.querySelectorAll('audio, source, .audio-node, [data-audio]').forEach(node => node.remove());
    return doc.body.innerHTML;
  };

  return <div className="space-y-6">
    <div className="rounded-2xl bg-card border border-border p-6 flex flex-col items-center gap-4">
      <audio ref={audio} src={audioSrc} preload="metadata" onError={() => setAudioError(true)} />
      <Button type="button" onClick={play} className="h-20 w-20 rounded-full" aria-label="Ouvir áudio desde o início">
        <Play className="h-8 w-8" />
      </Button>
      <p className="text-sm text-muted-foreground text-center">Ouça e escreva a frase em inglês. Repita o áudio quantas vezes quiser.</p>
      {audioError && <div role="alert" className="space-y-2 text-sm text-center">
        <p>Não foi possível reproduzir o áudio. Tente novamente ou pule este cartão.</p>
        <Button variant="outline" onClick={() => { audio.current?.load(); play(); }}><RotateCcw className="mr-2 h-4 w-4" />Tentar áudio novamente</Button>
      </div>}
    </div>
    <form onSubmit={event => { event.preventDefault(); check(); }} className="space-y-3">
      <label htmlFor="dictation-response" className="text-sm font-medium">O que você ouviu?</label>
      <Textarea id="dictation-response" value={typed} onChange={event => setTyped(event.target.value)}
        rows={3} maxLength={500} placeholder="Escreva a frase aqui..." disabled={!!result}
        spellCheck={false} autoCorrect="off" autoCapitalize="off" autoComplete="off" lang="en"
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault(); check();
          }
        }} />
      <p className="text-xs text-muted-foreground">Maiúsculas, espaços extras e pontuação final não contam como erro.</p>
      {!result && <Button type="submit" className="w-full" disabled={!typed.trim()}>Conferir</Button>}
    </form>
    {result && <div className="space-y-4">
      <div role="status" className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className={`font-bold ${result.correct ? 'text-green-500' : 'text-amber-500'}`}>
          {result.correct ? 'Correto!' : 'Veja o que ajustar'}
        </h2>
        <p className="text-sm"><span className="text-muted-foreground">Sua resposta: </span>{typed}</p>
        <p className="text-sm"><span className="text-muted-foreground">Frase correta: </span><span lang="en">{card.dictationAnswer}</span></p>
        {!result.correct && <ul className="text-sm space-y-1">
          {result.words.map((word, index) => word.kind === 'correct' ? null : <li key={index}>
            {word.kind === 'missing' ? <>Faltou: <strong>{word.expected}</strong></>
              : word.kind === 'extra' ? <>Palavra extra: <s>{word.typed}</s></>
                : <>Troque <s>{word.typed}</s> por <strong>{word.expected}</strong></>}
          </li>)}
        </ul>}
      </div>
      <Button className="w-full" onClick={() => onNext(result.correct)}>{last ? 'Ver resultado' : 'Próximo cartão'}</Button>
      <div className="rich-text-render break-words space-y-3 [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: reveal() }} />
    </div>}
    {!result && <Button variant="ghost" className="w-full" onClick={onSkip}>Pular cartão</Button>}
  </div>;
}
