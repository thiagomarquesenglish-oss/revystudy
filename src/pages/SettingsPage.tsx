import SyncUpdatesButton from '@/components/SyncUpdatesButton';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, User, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BackupSettings from '@/components/BackupSettings';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import OfflineMediaSettings from '@/components/OfflineMediaSettings';
export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate=useNavigate();
  return <div className="min-h-screen bg-background safe-bottom">
    <PageHeader title="Configurações" />
    <main className="max-w-3xl mx-auto px-4 pb-8 space-y-8" style={{ paddingTop: 'calc(var(--app-header-height) + 1.5rem)' }}>
      <section className="space-y-3">
        <h1 className="text-sm font-semibold text-muted-foreground">Conta</h1>
        <div className="flex items-center gap-4 bg-card rounded-2xl p-5">
          <User className="h-6 w-6 shrink-0 text-muted-foreground" />
          <div className="min-w-0"><p className="text-sm break-all">{user?.email}</p><p className="text-xs text-muted-foreground mt-1">Conta conectada</p></div>
        </div>
      </section>
      <OfflineMediaSettings />
      <details className="bg-card rounded-2xl p-5"><summary className="font-semibold cursor-pointer">Atualizações</summary><div className="pt-4 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Novidades dos seus baralhos</p><SyncUpdatesButton onInstalled={() => {}} /></div></details>
      <details className="bg-card rounded-2xl p-5"><summary className="font-semibold cursor-pointer">Backup e restaurar dados</summary><div className="pt-5"><BackupSettings /></div></details>
      <button onClick={()=>navigate('/curriculum/content')} className="w-full flex items-center gap-4 bg-card rounded-2xl p-5 text-left"><BookOpen className="h-6 w-6 text-primary"/><span><span className="block font-semibold">Conteúdo do currículo</span><span className="block text-sm text-muted-foreground mt-1">Preparar e importar conteúdo das etapas</span></span></button>
      <section className="space-y-3">
        <Button variant="ghost" className="text-destructive hover:text-destructive justify-start px-0" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sair da conta</Button>
      </section>
    </main>
    <BottomNav active="settings" />
  </div>;
}
