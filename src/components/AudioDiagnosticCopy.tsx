import { useState } from 'react';
import { audioDiagnosticReport } from '@/lib/audio-diagnostics';
export default function AudioDiagnosticCopy() {
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState('');
  return <div className="text-xs text-center" onClick={event => event.stopPropagation()}>
    <button type="button" className="underline p-2" onClick={async () => {
      const text = audioDiagnosticReport();
      try { await navigator.clipboard.writeText(text); setCopied(true); }
      catch { setReport(text); }
    }}>{copied ? 'Diagnóstico copiado' : 'Copiar diagnóstico do áudio'}</button>
    {report && <textarea aria-label="Diagnóstico do áudio para copiar" readOnly value={report} className="w-full h-32 text-foreground bg-background" onFocus={event => event.target.select()} />}
  </div>;
}
