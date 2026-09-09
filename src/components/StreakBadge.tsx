import { useState, useEffect, useCallback } from 'react';
import { Flame } from 'lucide-react';
import { getStreakHistory } from '@/lib/storage';
import { computeStreak } from '@/lib/streak';
import { useTabVisible } from '@/hooks/useTabVisible';

/** Fire color based on streak: gray(0), warm yellow → orange → red → white-hot */
function getFireColor(streak: number): string {
  if (streak === 0) return 'hsl(var(--muted-foreground))';
  if (streak <= 3) return '#f59e0b';   // amber
  if (streak <= 7) return '#f97316';   // orange
  if (streak <= 14) return '#ef4444';  // red
  if (streak <= 30) return '#dc2626';  // deep red
  return '#fbbf24';                     // white-hot gold
}

export default function StreakBadge() {
  const [streak, setStreak] = useState<number | null>(null);

  const refresh = useCallback(() => {
    getStreakHistory().then(h => setStreak(computeStreak(h))).catch(() => setStreak(null));
  }, []);
  useTabVisible('/', refresh);
  useEffect(() => {
    refresh();
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(visible, 60000);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); window.clearInterval(timer); };
  }, [refresh]);

  if (streak === null) return null;

  const color = getFireColor(streak);

  return (
    <div className="flex items-center gap-1">
      <Flame className="w-4 h-4" style={{ color }} />
      <span className="text-sm font-bold tabular-nums" style={{ color }}>
        {streak}
      </span>
    </div>
  );
}
