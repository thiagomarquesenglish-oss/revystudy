import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { createContext, useContext, useRef } from 'react';
import Index from '@/pages/Index';
import DecksPage from '@/pages/DecksPage';
import StatsPage from '@/pages/StatsPage';
import SettingsPage from '@/pages/SettingsPage';
import ProfilePage from '@/pages/ProfilePage';

const TAB_ROUTES = ['/', '/decks', '/stats', '/settings', '/profile'];

export const TabTransitionContext = createContext(0);
export const useTabTransitionKey = () => useContext(TabTransitionContext);

export default function TabLayout() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  const counterRef = useRef(0);
  const prevPathRef = useRef(pathname);

  if (prevPathRef.current !== pathname) {
    counterRef.current += 1;
    prevPathRef.current = pathname;
  }

  if (!TAB_ROUTES.includes(pathname)) return null;

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <TabTransitionContext.Provider value={counterRef.current}>
      {pathname === '/' && <Index />}
      {pathname === '/decks' && <DecksPage />}
      {pathname === '/stats' && <StatsPage />}
      {pathname === '/settings' && <SettingsPage />}
      {pathname === '/profile' && <ProfilePage />}
    </TabTransitionContext.Provider>
  );
}
