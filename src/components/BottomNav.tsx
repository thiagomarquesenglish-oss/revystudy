import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import homeSymbol from '@/assets/sf-symbols/house.fill.svg';
import librarySymbol from '@/assets/sf-symbols/books.vertical.fill.svg';
import progressSymbol from '@/assets/sf-symbols/chart.line.uptrend.xyaxis.svg';
import settingsSymbol from '@/assets/sf-symbols/gearshape.fill.svg';

interface BottomNavProps {
  active: 'home' | 'decks' | 'stats' | 'settings' | 'profile';
}

export default function BottomNav({ active }: BottomNavProps) {
  const navigate = useNavigate();

  const navItems = [
    { key: 'home' as const, label: 'Início', icon: homeSymbol, path: '/' },
    { key: 'decks' as const, label: 'Biblioteca', icon: librarySymbol, path: '/decks' },
    { key: 'stats' as const, label: 'Progresso', icon: progressSymbol, path: '/stats' },
    { key: 'settings' as const, label: 'Ajustes', icon: settingsSymbol, path: '/settings' },
  ];

  return createPortal(
    <div className="bottom-nav-viewport">
    <nav aria-label="Navegação principal" className="absolute bottom-0 left-0 right-0 pointer-events-auto bg-card/95 backdrop-blur-xl border-t border-border px-2 pt-1 safe-area-bottom-nav">
      <div className="flex max-w-3xl mx-auto">
        {navItems.map(({ key, label, icon, path }) => (
          <button
            key={key}
            onClick={() => navigate(path)}
            aria-current={(active === key || (active === 'profile' && key === 'settings')) ? 'page' : undefined}
            className={`flex-1 min-w-0 min-h-11 flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors active:opacity-70 ${
              active === key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <img src={icon} alt={label} aria-hidden="true" className="sf-symbol-icon h-7 w-7 object-contain" />
          </button>
        ))}
      </div>
    </nav>
    </div>, document.body,
  );
}
