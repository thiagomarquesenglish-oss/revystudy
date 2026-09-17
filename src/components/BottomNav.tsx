import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Home, Library, TrendingUp, Settings, User } from 'lucide-react';

interface BottomNavProps {
  active: 'home' | 'decks' | 'stats' | 'settings' | 'profile';
}

export default function BottomNav({ active }: BottomNavProps) {
  const navigate = useNavigate();

  const navItems = [
    { key: 'home' as const, label: 'Início', icon: Home, path: '/' },
    { key: 'decks' as const, label: 'Biblioteca', icon: Library, path: '/decks' },
    { key: 'stats' as const, label: 'Progresso', icon: TrendingUp, path: '/stats' },
    { key: 'settings' as const, label: 'Ajustes', icon: Settings, path: '/settings' },
  ];

  return createPortal(
    <div className="bottom-nav-viewport">
    <nav aria-label="Navegação principal" className="absolute bottom-0 left-0 right-0 pointer-events-auto bg-card/95 backdrop-blur-xl border-t border-border px-2 pt-1 safe-area-bottom-nav">
      <div className="flex max-w-3xl mx-auto">
        {navItems.map(({ key, label, icon: Icon, path }) => (
          <button
            key={key}
            onClick={() => navigate(path)}
            aria-current={(active === key || (active === 'profile' && key === 'settings')) ? 'page' : undefined}
            className={`flex-1 min-w-0 min-h-11 flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors active:opacity-70 ${
              active === key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={20} /><span className="truncate w-full text-center">{label}</span>
          </button>
        ))}
      </div>
    </nav>
    </div>, document.body,
  );
}
