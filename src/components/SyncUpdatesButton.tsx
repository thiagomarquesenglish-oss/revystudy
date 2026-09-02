import { useState, useEffect, useRef } from 'react';
import { CloudDownload, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  checkDeckUpdates,
  downloadDeckPackage,
  type DeckUpdate,
  type PackageSyncProgress,
} from '@/lib/storage';

interface SyncUpdatesButtonProps {
  onInstalled: () => void;
}

export default function SyncUpdatesButton({ onInstalled }: SyncUpdatesButtonProps) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updates, setUpdates] = useState<DeckUpdate[]>([]);
  const [checked, setChecked] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<PackageSyncProgress | null>(null);
  const autoChecked = useRef(false);

  const check = async () => {
    setChecking(true);
    try {
      const found = await checkDeckUpdates();
      setUpdates(found);
      setChecked(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível verificar agora');
    } finally {
      setChecking(false);
    }
  };

  // Checagem automática e silenciosa ao abrir o app
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    if (!navigator.onLine) return;
    checkDeckUpdates()
      .then((found) => {
        setUpdates(found);
        if (found.length > 0) {
          setChecked(true);
          toast.message('Atualizações disponíveis', {
            description: 'Há conteúdo novo na nuvem. Toque no ícone de download para baixar.',
          });
        }
      })
      .catch(() => { /* silencioso: usuário pode verificar manualmente */ });
  }, []);

  const openAndCheck = () => {
    setOpen(true);
    void check();
  };

  const download = async (update: DeckUpdate) => {
    setDownloadingId(update.deckId);
    setProgress({ completed: 0, total: 1, label: 'Preparando atualização' });
    try {
      await downloadDeckPackage(update, setProgress);
      setUpdates((current) => current.filter((item) => item.deckId !== update.deckId));
      toast.success(`${update.name} atualizado no celular`);
      onInstalled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao baixar atualização');
    } finally {
      setDownloadingId(null);
      setProgress(null);
    }
  };

  const percent = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground relative"
        onClick={openAndCheck}
        aria-label="Verificar atualizações"
        title="Verificar atualizações"
      >
        <CloudDownload className="h-5 w-5" />
        {updates.length > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
        )}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Atualizações</DrawerTitle>
            <DrawerDescription>Baixe no celular o conteúdo adicionado em outros dispositivos.</DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-3">
            {checking && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Verificando a nuvem…
              </div>
            )}

            {!checking && checked && updates.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-7 w-7 text-col-review" />
                <p className="font-medium">Tudo atualizado</p>
                <p className="text-sm text-muted-foreground">Este aparelho já tem os pacotes mais recentes.</p>
              </div>
            )}

            {!checking && updates.map((update) => {
              const downloading = downloadingId === update.deckId;
              return (
                <div key={update.deckId} className="rounded-lg bg-card p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{update.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Nuvem: {update.cardCount} cartões · {update.audioCount} áudios
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Neste aparelho: {update.localCardCount} cartões · {update.localAudioCount} áudios
                      </p>
                    </div>
                    <Button size="sm" disabled={downloadingId !== null} onClick={() => void download(update)}>
                      <CloudDownload />
                      Baixar tudo
                    </Button>
                  </div>
                  {downloading && progress && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{progress.label}</span>
                        <span>{percent}%</span>
                      </div>
                      <Progress value={percent} className="h-1.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {!checking && checked && (
              <Button variant="secondary" className="w-full" disabled={downloadingId !== null} onClick={() => void check()}>
                <RefreshCw />
                Verificar novamente
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
