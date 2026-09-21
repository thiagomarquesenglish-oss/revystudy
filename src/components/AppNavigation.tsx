import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import BottomNav from './BottomNav';

const tabs = {
  '/': 'home',
  '/decks': 'decks',
  '/library/manage': 'decks',
  '/stats': 'stats',
  '/settings': 'settings',
  '/profile': 'settings',
} as const;

// Lives outside page routes: switching tabs updates selection, not the frame.
export default function AppNavigation() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  const active = tabs[pathname as keyof typeof tabs];
  if (!user || loading || !active) return null;
  return <BottomNav active={active} />;
}
