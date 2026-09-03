import { useAuth } from '@/hooks/useAuth';
import { LogOut, User } from 'lucide-react';
import BackupSettings from '@/components/BackupSettings';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
export default function SettingsPage() {
  const { user, signOut } = useAuth();
  return <div className="min-h-screen bg-background safe-bottom">
    <PageHeader title="Configurações" />
    <main className="max-w-3xl mx-auto px-4 pb-8 space-y-8" style={{ paddingTop: 'calc(var(--app-header-height) + 1.5rem)' }}>
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">Sua conta</h1>
        <div className="flex items-center gap-4 bg-card rounded-2xl p-5">
          <User className="h-6 w-6 shrink-0 text-muted-foreground" />
          <div className="min-w-0"><p className="text-sm break-all">{user?.email}</p><p className="text-xs text-muted-foreground mt-1">Conta conectada</p></div>
        </div>
      </section>
      <BackupSettings />
      <section className="space-y-3">
        <Button variant="ghost" className="text-destructive hover:text-destructive justify-start px-0" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sair da conta</Button>
      </section>
    </main>
    <BottomNav active="settings" />
  </div>;
}
