import { useRef, useState } from 'react';
import { compareAudio } from '@/lib/compare-audio';
import { recordAudio } from '@/lib/audio-diagnostics';
export default function AudioFileCheck({ src, player }: { src: string; player: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  return <div>
    <button type="button" disabled={busy} className="underline p-2" onClick={async event => {
      event.stopPropagation();
      if (lock.current) return;
      lock.current = true; setBusy(true); setResult('');
      recordAudio('file-comparison-start', player);
      try {
        const report = await compareAudio(src);
        recordAudio('file-comparison-result', player, report);
        setResult(report.identical ? 'O arquivo salvo é idêntico ao original. Copie o diagnóstico abaixo.' : 'O arquivo salvo difere do original. Copie o diagnóstico abaixo.');
      } catch (error) {
        recordAudio('file-comparison-error', player, { name: error instanceof Error ? error.name : 'unknown' });
        setResult('Não foi possível comparar. Confira a conexão e tente novamente.');
      } finally { lock.current = false; setBusy(false); }
    }}>{busy ? 'Comparando arquivos…' : 'Verificar arquivo salvo'}</button>
    {result && <p>{result}</p>}
  </div>;
}
