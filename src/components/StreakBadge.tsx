import { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';
import { getReviewHistory } from '@/lib/storage';

function computeStreak(history: { date: string; count: number }[]): number {
  if (history.length === 0) return 0;

  const dates = new Set(history.map(h => h.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if studied today; if not, start from yesterday
  const todayStr = today.toISOString().slice(0, 10);
  let current = new Date(today);
  if (!dates.has(todayStr)) {
    current.setDate(current.getDate() - 1);
    if (!dates.has(current.toISOString().slice(0, 10))) return 0;
  }

  let streak = 0;
  while (dates.has(current.toISOString().slice(0, 10))) {
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}

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

  useEffect(() => {
    getReviewHistory().then(h => setStreak(computeStreak(h))).catch(() => setStreak(0));
  }, []);

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
