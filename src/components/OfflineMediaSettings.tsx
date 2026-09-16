import { useEffect, useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  cacheAllLocalMedia,
  clearOfflineMedia,
  offlineMediaCount,
  offlineMediaEnabled,
  setOfflineMediaEnabled,
  type MediaDownloadProgress,
} from '@/lib/offline-media';

export default function OfflineMediaSettings() {
  const [enabled, setEnabled] = useState(offlineMediaEnabled);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<MediaDownloadProgress | null>(null);

  useEffect(() => { void offlineMediaCount().then(setCount); }, []);

  const toggle = (next: boolean) => {
    setEnabled(next);
    setOfflineMediaEnabled(next);
    toast.success(next ? 'Novas mídias serão salvas automaticamente.' : 'Download automático desativado.');
  };

  const download = async () => {
    if (!navigator.onLine) { toast.error('Conecte-se à internet para baixar as mídias.'); return; }
    setBusy(true);
    setProgress({ completed: 0, total: 1, label: 'Preparando mídias' });
    try {
      setOfflineMediaEnabled(true);
      setEnabled(true);
      const downloaded = await cacheAllLocalMedia(setProgress);
      setCount(await offlineMediaCount());
      toast.success(downloaded ? `${downloaded} mídias disponíveis no aparelho.` : 'Não há mídias para baixar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível baixar as mídias.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await clearOfflineMedia();
      setCount(0);
      toast.success('Imagens e áudios locais removidos. Eles continuam seguros na nuvem.');
    } finally { setBusy(false); }
  };

  const percent = progress ? Math.round(progress.completed / Math.max(progress.total, 1) * 100) : 0;

  return <section className="bg-card rounded-2xl p-5 space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-semibold">Imagens e áudios no aparelho</h2>
        <p className="text-sm text-muted-foreground mt-1">Estude sem esperar a nuvem. As próximas atualizações também terão as mídias baixadas.</p>
      </div>
      <Switch checked={enabled} onCheckedChange={toggle} aria-label="Salvar novas mídias automaticamente" />
    </div>

    <p className="text-xs text-muted-foreground">{count > 0 ? `${count} arquivos salvos neste aparelho.` : 'Nenhuma mídia foi salva neste aparelho ainda.'}</p>

    {progress && <div className="space-y-2">
      <div className="flex justify-between gap-3 text-xs text-muted-foreground"><span>{progress.label}</span><span>{percent}%</span></div>
      <Progress value={percent} className="h-1.5" />
    </div>}

    <div className="flex flex-col sm:flex-row gap-2">
      <Button className="flex-1" onClick={() => void download()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Download />} Baixar tudo neste aparelho
      </Button>
      {count > 0 && <Button variant="secondary" onClick={() => void clear()} disabled={busy}><Trash2 /> Remover cópias locais</Button>}
    </div>
  </section>;
}
