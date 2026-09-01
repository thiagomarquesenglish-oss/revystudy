import { User as UserIcon, LogOut, Mail, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import PageTransition from '@/components/PageTransition';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ProfilePage() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const createdAt = user.created_at
    ? format(new Date(user.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : '—';

  return (
    <div className="min-h-screen bg-background safe-bottom">
      <PageHeader title="Perfil" />
      <PageTransition>
        <main className="max-w-3xl mx-auto px-3 py-4 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>
          <div className="bg-card rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <UserIcon size={32} />
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium truncate">{user.email}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mail size={14} />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={14} />
                <span>Membro desde {createdAt}</span>
              </div>
            </div>
          </div>

          <Button
            variant="destructive"
            className="w-full"
            onClick={signOut}
          >
            <LogOut size={16} className="mr-2" />
            Sair da conta
          </Button>

          <p className="text-xs text-muted-foreground text-center">Versão 1.6</p>
        </main>
      </PageTransition>
      <BottomNav active="profile" />
    </div>
  );
}
