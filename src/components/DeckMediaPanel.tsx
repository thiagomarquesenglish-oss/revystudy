import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { getDeckAudios } from '@/lib/storage';
import type { Flashcard } from '@/lib/types';
import { AUDIO_SAVED_EVENT, extractAudioSrcs, hasSavedAudio, prefetchAudios } from '@/lib/saved-audio';

/** Shows how many of this deck's audios are saved on the device and downloads the missing ones in one tap. */
export default function DeckMediaPanel({ deckId, cards }: { deckId: string; cards: Flashcard[] }) {
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(0);
  const alive = useRef(true);
  const busy = useRef(false);

  const scan = useCallback(async () => {
    const sources = new Set<string>();
    for (const card of cards) { extractAudioSrcs(card.front).forEach(src => sources.add(src)); extractAudioSrcs(card.back).forEach(src => sources.add(src)); }
    try {
      for (const audio of await getDeckAudios(deckId)) sources.add(supabase.storage.from('deck-audios').getPublicUrl(audio.file_path).data.publicUrl);
    } catch { /* offline: fall back to the audios embedded in the cards */ }
    const missing: string[] = [];
    for (const src of sources) { if (!(await hasSavedAudio(src).catch(() => false))) missing.push(src); }
    if (alive.current) { setTotal(sources.size); setPending(missing); }
  }, [cards, deckId]);

  useEffect(() => {
    alive.current = true;
    void scan();
    const refresh = () => { if (!busy.current) void scan(); };
    window.addEventListener(AUDIO_SAVED_EVENT, refresh);
    return () => { alive.current = false; window.removeEventListener(AUDIO_SAVED_EVENT, refresh); };
  }, [scan]);

  const downloadAll = async () => {
    if (busy.current || !pending.length) return;
    busy.current = true; setFailed(0); setProgress({ done: 0, total: pending.length });
    try {
      const result = await prefetchAudios(pending, { onProgress: (done, count) => { if (alive.current) setProgress({ done, total: count }); } });
      if (alive.current) setFailed(result.failed);
    } finally {
      busy.current = false;
      if (alive.current) { setProgress(null); await scan(); }
    }
  };

  if (total === 0) return null;
  const saved = total - pending.length;
  return <section className="bg-card rounded-2xl p-4 space-y-3" aria-label="Áudios do baralho">
    <div className="flex items-center gap-3">
      {pending.length === 0 && !progress ? <CheckCircle2 className="h-6 w-6 shrink-0 text-primary" /> : <Download className="h-6 w-6 shrink-0 text-primary" />}
      <div className="min-w-0 flex-1">
        <p className="font-bold">Áudios do baralho</p>
        <p className="text-sm text-muted-foreground">
          {progress ? `Baixando ${progress.done} de ${progress.total}…`
            : pending.length === 0 ? `Todos os ${total} áudios estão salvos neste aparelho.`
            : `${saved} de ${total} salvos · ${pending.length} pendente${pending.length > 1 ? 's' : ''}`}
        </p>
      </div>
      {pending.length > 0 && <Button size="sm" onClick={() => void downloadAll()} disabled={!!progress}>
        {progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {progress ? 'Baixando' : `Baixar ${pending.length}`}
      </Button>}
    </div>
    {progress && <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />}
    {!progress && failed > 0 && <p role="alert" className="text-xs text-destructive">{failed} áudio{failed > 1 ? 's' : ''} não baixou. Verifique a internet e toque em Baixar de novo.</p>}
  </section>;
}
