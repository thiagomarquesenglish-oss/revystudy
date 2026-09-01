import { WifiOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function OfflineBanner() {
  const { isOnline, isSyncing } = useOnlineStatus();

  if (isOnline && !isSyncing) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-1.5 px-4 text-sm font-medium safe-top"
      style={{ backgroundColor: isOnline ? 'hsl(var(--success))' : 'hsl(var(--warning))', color: isOnline ? 'white' : 'hsl(var(--warning-foreground))' }}>
      {isSyncing ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Sincronizando…</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>Modo offline — alterações serão sincronizadas ao reconectar</span>
        </>
      )}
    </div>
  );
}
