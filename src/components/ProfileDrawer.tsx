import { User as UserIcon, LogOut, Mail, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
} from '@/components/ui/drawer';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ProfileDrawer() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const createdAt = user.created_at
    ? format(new Date(user.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : '—';

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
          aria-label="Perfil"
        >
          <UserIcon size={18} />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Meu perfil</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-2 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <UserIcon size={28} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.email}</p>
            </div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
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

        <DrawerFooter>
          <Button
            variant="destructive"
            className="w-full"
            onClick={signOut}
          >
            <LogOut size={16} className="mr-2" />
            Sair da conta
          </Button>
          <p className="text-xs text-muted-foreground text-left mt-2">Versão 1.4</p>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
