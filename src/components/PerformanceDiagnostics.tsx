import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DIAGNOSTICS_EVENT, diagnosticsEnabled, performanceSnapshot, setDiagnosticsEnabled, startDiagnostics } from '@/lib/performance-diagnostics';
import { audioResourceSnapshot } from '@/lib/audio-engine';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';

export function PerformanceMonitor() {
  useEffect(() => {
    let stop: (() => void)|undefined;
    const update = () => { stop?.(); stop = diagnosticsEnabled() ? startDiagnostics() : undefined; };
    update(); window.addEventListener(DIAGNOSTICS_EVENT,update);
    return () => {stop?.();window.removeEventListener(DIAGNOSTICS_EVENT,update);};
  },[]);
  return null;
}
const snapshot = () => ({version:__APP_VERSION__,userAgent:navigator.userAgent,...performanceSnapshot(),audio:audioResourceSnapshot()});
export default function PerformanceDiagnostics() {
  const [enabled,setEnabled] = useState(diagnosticsEnabled);
  const [open,setOpen] = useState(false);
  const [data,setData] = useState(snapshot);
  useEffect(() => {
    if(!open || !enabled) return;
    setData(snapshot());
    const timer = setInterval(() => {if(!document.hidden)setData(snapshot());},2000);
    return () => clearInterval(timer);
  },[open,enabled]);
  return <section className="bg-card rounded-2xl p-5 space-y-3">
    <label className="flex items-center justify-between gap-3"><span className="font-semibold">Diagnóstico de desempenho</span><Switch checked={enabled} aria-label="Diagnóstico de desempenho" onCheckedChange={value => {setDiagnosticsEnabled(value);setEnabled(value);}} /></label>
    <p className="text-sm text-muted-foreground">Ative durante o uso para registrar a atividade do app. O iPhone não informa temperatura, CPU ou consumo de bateria.</p>
    {enabled && <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>Ver diagnóstico</Button>}
    <Drawer open={open} onOpenChange={setOpen}><DrawerContent><DrawerHeader><DrawerTitle>Diagnóstico de desempenho</DrawerTitle></DrawerHeader>
      <div className="px-4 pb-6 space-y-3 overflow-y-auto max-h-[75dvh]">
        <p className="text-sm text-muted-foreground">Sessão atual · {data.seconds} segundos · atualização a cada 2 segundos</p>
        <dl className="space-y-2 text-sm">
          {Object.entries({'Requisições em andamento':data.activeRequests,'Requisições concluídas':data.completedRequests,'Falhas de requisição':data.failedRequests,'Imagens carregadas':data.resources.images,'Carregamento mais lento':`${data.resources.slowestMs} ms`,'Áudios preparados na memória':data.audio.cached,'Memória estimada dos áudios':`${(data.audio.bytes/1048576).toFixed(1)} MB`,'Áudios tocando':data.audio.playing,'Sistema de áudio':data.audio.state,'Atrasos da interface (>200 ms)':data.interfaceDelays,'Maior atraso':`${data.maxInterfaceDelayMs} ms`}).map(([label,value]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <h3 className="font-semibold">Últimas requisições</h3>
        {data.recentRequests.slice(-10).reverse().map((item,i) => <p key={i} className="text-xs text-muted-foreground">{item.category} · {item.durationMs} ms · {item.status}</p>)}
        <Button className="w-full" onClick={async () => {try {await navigator.clipboard.writeText(JSON.stringify(snapshot(),null,2));toast.success('Relatório copiado');} catch {toast.error('Não foi possível copiar o relatório.');}}}>Copiar relatório</Button>
      </div>
    </DrawerContent></Drawer>
  </section>;
}
