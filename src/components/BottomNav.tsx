import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import homeSymbol from '@/assets/sf-symbols/house.fill.svg';
import librarySymbol from '@/assets/sf-symbols/books.vertical.fill.svg';
import progressSymbol from '@/assets/sf-symbols/chart.line.uptrend.xyaxis.svg';
import settingsSymbol from '@/assets/sf-symbols/gearshape.fill.svg';
import './BottomNav.css';

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
    <div className="navigation-viewport">
    <nav aria-label="Navegação principal" className="navigation-capsule">
        {navItems.map(({ key, label, icon, path }) => (
          <button
            key={key}
            aria-label={label}
            onClick={() => navigate(path)}
            aria-current={(active === key || (active === 'profile' && key === 'settings')) ? 'page' : undefined}
            className="navigation-tab"
          >
            {/* Vite inlines small SVGs as data URLs containing spaces/quotes.
                CSS url() must quote these, otherwise the mask becomes invalid. */}
            <span aria-hidden="true" className="navigation-icon" style={{ maskImage: `url(${JSON.stringify(icon)})`, WebkitMaskImage: `url(${JSON.stringify(icon)})` }} />
          </button>
        ))}
    </nav>
    </div>, document.body,
  );
}
