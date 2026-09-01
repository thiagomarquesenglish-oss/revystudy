import { useMemo, useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { getReviewHistory, getCachedReviewHistory } from '@/lib/storage';

interface DayData {
  date: string;
  count: number;
}

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

const ROWS_MOBILE = 14;
const ROWS_DESKTOP = 7;

export default function Heatmap() {
  const isMobile = useIsMobile();
  const ROWS = isMobile ? ROWS_MOBILE : ROWS_DESKTOP;
  const cachedData = getCachedReviewHistory();
  const [history, setHistory] = useState<DayData[]>(cachedData || []);

  useEffect(() => {
    getReviewHistory().then(data => {
      setHistory(data);
    }).catch(console.error);
  }, []);

  const historyMap = useMemo(() => {
    const map: Record<string, number> = {};
    history.forEach(d => { map[d.date] = d.count; });
    return map;
  }, [history]);

  const year = new Date().getFullYear();
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  const allDays: { date: Date; dateStr: string; count: number }[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    allDays.push({ date: new Date(cursor), dateStr, count: historyMap[dateStr] || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const COLS = Math.ceil(allDays.length / ROWS);

  // Build grid in row-major order: days flow left to right, then next row
  const grid: (typeof allDays[number] | null)[][] = [];
  for (let row = 0; row < ROWS; row++) {
    grid[row] = [];
    for (let col = 0; col < COLS; col++) {
      const dayIndex = row * COLS + col;
      grid[row][col] = dayIndex < allDays.length ? allDays[dayIndex] : null;
    }
  }

  const totalReviewed = history.reduce((sum, d) => sum + d.count, 0);
  const daysStudied = history.filter(d => d.count > 0).length;
  const totalDays = allDays.length;
  const pctDays = totalDays > 0 ? Math.round((daysStudied / totalDays) * 100) : 0;
  const dailyAvg = daysStudied > 0 ? Math.round(totalReviewed / daysStudied) : 0;

  let currentStreak = 0;
  const checkDate = new Date();
  const dateSet = new Set(history.filter(d => d.count > 0).map(d => d.date));
  for (let i = 0; i < 365; i++) {
    const ds = checkDate.toISOString().slice(0, 10);
    if (dateSet.has(ds)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  let longestStreak = 0, tempStreak = 0;
  const allDates = Array.from(dateSet).sort();
  for (let i = 0; i < allDates.length; i++) {
    if (i === 0) { tempStreak = 1; } else {
      const diff = (new Date(allDates[i]).getTime() - new Date(allDates[i - 1]).getTime()) / 86400000;
      tempStreak = diff === 1 ? tempStreak + 1 : 1;
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }

  const levelColors = [
    'bg-[hsl(var(--heatmap-empty))]',
    'bg-[hsl(var(--heatmap-l1))]',
    'bg-[hsl(var(--heatmap-l2))]',
    'bg-[hsl(var(--heatmap-l3))]',
    'bg-[hsl(var(--heatmap-l4))]',
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground text-center">{year}</p>
      <div className="pb-1">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)`, gap: '1px' }}>
          {grid.flat().map((day, i) => (
            <div
              key={i}
              className={`rounded-[1px] ${day ? levelColors[getLevel(day.count)] : ''}`}
              style={{ aspectRatio: '1' }}
              title={day ? `${day.date.toLocaleDateString('pt-BR')}: ${day.count} cartões` : ''}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm sm:text-sm text-foreground">
        <span>Média diária: <strong className="text-col-review">{dailyAvg} cartões</strong></span>
        <span>Dias estudados: <strong className="text-col-review">{pctDays}%</strong></span>
        <span>Maior sequência: <strong className="text-col-review">{longestStreak} dias</strong></span>
        <span>Sequência atual: <strong className="text-col-review">{currentStreak} {currentStreak === 1 ? 'dia' : 'dias'}</strong></span>
      </div>
    </div>
  );
}
