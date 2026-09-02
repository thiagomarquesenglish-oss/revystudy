import { WifiOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useLocation } from 'react-router-dom';

export default function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount } = useOnlineStatus();
  const { pathname } = useLocation();

  // Keep background synchronization, without covering the study header.
  if (/^\/(study|custom-study)\//.test(pathname)) return null;

  if (isOnline && !isSyncing && pendingCount === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-1.5 px-4 text-sm font-medium safe-top"
      style={{ backgroundColor: isOnline && pendingCount === 0 ? 'hsl(var(--success))' : 'hsl(var(--warning))', color: isOnline && pendingCount === 0 ? 'white' : 'hsl(var(--warning-foreground))' }}>
      {isSyncing ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Sincronizando…</span>
        </>
      ) : !isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>Modo offline — {pendingCount > 0 ? `${pendingCount} alterações aguardando a nuvem` : 'as alterações serão sincronizadas ao reconectar'}</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{pendingCount} alterações aguardando confirmação da nuvem</span>
        </>
      )}
    </div>
  );
}
