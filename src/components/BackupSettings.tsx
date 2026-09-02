import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, CloudUpload, Download, Mail, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  createFullBackup,
  downloadFullBackup,
  FullBackupManifest,
  inspectFullBackup,
  restoreFullBackup,
  RestoreMode,
} from '@/lib/full-backup';
import { getPinnedStats } from '@/lib/pinned-stats';

interface BackupSettingsRow {
  enabled: boolean;
  email: string;
  weekday: number;
  timezone: string;
  retention_count: number;
  include_media: boolean;
  last_backup_at: string | null;
}

interface BackupRunRow {
  status: string;
  created_at: string;
  size_bytes: number | null;
  error_message: string | null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Nunca';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupSettings() {
  const { user, session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<BackupSettingsRow | null>(null);
  const [lastRun, setLastRun] = useState<BackupRunRow | null>(null);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<'export' | 'restore' | 'email' | 'toggle' | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingManifest, setPendingManifest] = useState<FullBackupManifest | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const client = supabase;
    const [{ data: current, error }, { data: runs }, healthResponse] = await Promise.all([
      client.from('backup_settings').select('*').eq('user_id', user.id).maybeSingle(),
      client.from('backup_runs').select('status,created_at,size_bytes,error_message')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
      fetch('/api/weekly-backup?health=1').catch(() => null),
    ]);
    if (healthResponse?.ok) {
      const health = await healthResponse.json();
      setServerReady(Boolean(health.supabaseConnected && health.emailConnected && health.cronConnected));
    } else {
      setServerReady(false);
    }
    if (error) {
      console.error(error);
      return;
    }
    if (current) {
      setSettings(current);
    } else {
      const initial = {
        user_id: user.id,
        enabled: false,
        email: user.email || '',
        weekday: 0,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        retention_count: 4,
        include_media: true,
        preferences: { pinnedStats: getPinnedStats() },
      };
      const { data: created } = await client.from('backup_settings').insert(initial).select('*').single();
      if (created) setSettings(created);
    }
    setLastRun(runs?.[0] || null);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggleAutomatic = async (enabled: boolean) => {
    if (!user || !settings) return;
    if (enabled && serverReady === false) {
      toast.error('O envio automático ainda precisa ser conectado ao serviço de e-mail.');
      return;
    }
    setBusy('toggle');
    const client = supabase;
    const { data, error } = await client.from('backup_settings').upsert({
      user_id: user.id,
      ...settings,
      enabled,
      email: user.email || settings.email,
      preferences: { pinnedStats: getPinnedStats() },
    }).select('*').single();
    setBusy(null);
    if (error) {
      toast.error('Não foi possível alterar o backup automático.');
      return;
    }
    setSettings(data);
    toast.success(enabled ? 'Backup automático ativado para todo domingo.' : 'Backup automático desativado.');
  };

  const handleLocalBackup = async () => {
    setBusy('export');
    try {
      const blob = await createFullBackup();
      downloadFullBackup(blob);
      toast.success('Backup completo conferido e salvo!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o backup.');
    } finally {
      setBusy(null);
    }
  };

  const handleEmailBackup = async () => {
    if (!session) return;
    setBusy('email');
    try {
      const response = await fetch('/api/weekly-backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o backup.');
      toast.success(`Backup enviado para ${user?.email}.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o backup.');
    } finally {
      setBusy(null);
    }
  };

  const chooseBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const manifest = await inspectFullBackup(file);
      setPendingFile(file);
      setPendingManifest(manifest);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backup inválido.');
    }
  };

  const restore = async (mode: RestoreMode) => {
    if (!pendingFile) return;
    setBusy('restore');
    try {
      const counts = await restoreFullBackup(pendingFile, mode);
      toast.success(`Restauração concluída: ${counts.decks} baralhos e ${counts.cards} cartões.`);
      setPendingFile(null);
      setPendingManifest(null);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível restaurar o backup.');
      setBusy(null);
    }
  };

  const localBackupAt = localStorage.getItem('revystudy-last-local-backup');

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Backup e segurança</h3>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 flex items-start gap-3 border-b border-border">
          <div className="rounded-lg bg-primary/10 p-2"><ShieldCheck className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">Backup completo do RevyStudy</p>
            <p className="text-xs text-muted-foreground mt-1">
              Inclui cartões, imagens, áudios, progresso, dias estudados e estatísticas.
            </p>
          </div>
        </div>

        <div className="p-4 flex items-center justify-between gap-4 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium"><CalendarClock className="w-4 h-4" /> Todo domingo</div>
            <p className="text-xs text-muted-foreground mt-1 truncate">Enviar link para {user?.email || settings?.email}</p>
          </div>
          <Switch
            checked={settings?.enabled || false}
            disabled={!settings || busy === 'toggle' || serverReady === null}
            onCheckedChange={toggleAutomatic}
            aria-label="Ativar backup automático semanal"
          />
        </div>

        <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border space-y-1">
          {serverReady === false && (
            <p className="text-orange-500">Envio automático aguardando conexão segura do serviço de e-mail.</p>
          )}
          <p>Último backup automático: <span className="text-foreground">{formatDate(settings?.last_backup_at)}</span></p>
          <p>Último backup neste aparelho: <span className="text-foreground">{formatDate(localBackupAt)}</span></p>
          {lastRun && (
            <p>
              Última tentativa: <span className={lastRun.status === 'success' ? 'text-emerald-500' : 'text-orange-500'}>
                {lastRun.status === 'success' ? `Concluída ${formatBytes(lastRun.size_bytes)}` : lastRun.error_message || 'Falhou'}
              </span>
            </p>
          )}
        </div>

        <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button variant="outline" className="gap-2" onClick={handleLocalBackup} disabled={busy !== null}>
            <Download className="w-4 h-4" /> {busy === 'export' ? 'Preparando...' : 'Salvar agora'}
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleEmailBackup} disabled={busy !== null || serverReady !== true}>
            <Mail className="w-4 h-4" /> {busy === 'email' ? 'Enviando...' : 'Enviar por e-mail'}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
            <Upload className="w-4 h-4" /> Restaurar
          </Button>
        </div>
        <div className="px-4 pb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <CloudUpload className="w-3.5 h-3.5" /> São mantidos apenas os 4 backups automáticos mais recentes.
        </div>
      </div>

      <input ref={inputRef} type="file" accept=".zip,.revystudy" className="hidden" onChange={chooseBackup} />

      <AlertDialog open={!!pendingFile} onOpenChange={(open) => {
        if (!open && busy !== 'restore') {
          setPendingFile(null);
          setPendingManifest(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Como deseja restaurar?</AlertDialogTitle>
            <AlertDialogDescription>
              Backup de {pendingManifest ? formatDate(pendingManifest.generatedAt) : ''}, com {pendingManifest?.counts.decks || 0} baralhos,
              {' '}{pendingManifest?.counts.cards || 0} cartões e {pendingManifest?.counts.reviews || 0} revisões.
              Mesclar não apaga os dados atuais. Substituir remove os dados atuais antes da restauração.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={busy === 'restore'}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy === 'restore'} onClick={(event) => { event.preventDefault(); restore('merge'); }}>
              Mesclar
            </AlertDialogAction>
            <Button variant="destructive" disabled={busy === 'restore'} onClick={() => restore('replace')}>
              {busy === 'restore' ? 'Restaurando...' : 'Substituir tudo'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
