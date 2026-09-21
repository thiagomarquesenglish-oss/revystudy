import { useState } from 'react';
import { toast } from 'sonner';
import { captureNavigationGeometry, navigationDiagnostics } from '@/lib/navigation-diagnostics';

export default function NavigationDiagnostics() {
  const [report, setReport] = useState('');
  const refresh = () => { captureNavigationGeometry('report'); setReport(navigationDiagnostics()); };
  return <details className="bg-card rounded-2xl p-5" onToggle={event => { if (event.currentTarget.open) refresh(); }}>
    <summary className="font-semibold cursor-pointer">Diagnóstico da barra</summary>
    <p className="text-sm text-muted-foreground mt-4">Registra apenas medidas da tela nesta abertura. Não envia dados automaticamente.</p>
    <button type="button" className="mt-4 rounded-xl bg-secondary px-4 py-3" onClick={async () => {
      captureNavigationGeometry('copy');
      const text = navigationDiagnostics(); setReport(text);
      try { await navigator.clipboard.writeText(text); toast.success('Diagnóstico copiado'); }
      catch { toast.error('Selecione e copie o texto abaixo.'); }
    }}>Copiar diagnóstico</button>
    <textarea aria-label="Relatório da barra" readOnly value={report} className="mt-4 w-full h-56 rounded-xl bg-background p-3 text-xs font-mono" />
  </details>;
}
