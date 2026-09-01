import { useNavigate } from 'react-router-dom';
import { Layers, LayoutGrid, BarChart3, Settings, User } from 'lucide-react';

interface BottomNavProps {
  active: 'home' | 'decks' | 'stats' | 'settings' | 'profile';
}

export default function BottomNav({ active }: BottomNavProps) {
  const navigate = useNavigate();

  const navItems = [
    { key: 'home' as const, label: 'Início', icon: Layers, path: '/' },
    { key: 'decks' as const, label: 'Painel', icon: LayoutGrid, path: '/decks' },
    { key: 'stats' as const, label: 'Estatísticas', icon: BarChart3, path: '/stats' },
    { key: 'settings' as const, label: 'Configurações', icon: Settings, path: '/settings' },
    { key: 'profile' as const, label: 'Perfil', icon: User, path: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1b1b1b]/80 backdrop-blur-xl border-t border-border z-20 px-4 py-2 safe-area-bottom-nav">
      <div className="flex">
        {navItems.map(({ key, label, icon: Icon, path }) => (
          <button
            key={key}
            onClick={() => navigate(path)}
            className={`flex-1 flex items-center justify-center pt-1 pb-4 px-4 transition-colors active:opacity-70 ${
              active === key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={22} />
          </button>
        ))}
      </div>
    </nav>
  );
}
