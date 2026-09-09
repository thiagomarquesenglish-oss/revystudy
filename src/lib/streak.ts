export function localStudyDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function computeStreak(history: {date: string; count: number}[], now = new Date()): number {
  const dates = new Set(history.filter(item => item.count > 0).map(item => item.date));
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!dates.has(localStudyDate(day))) day.setDate(day.getDate()-1);
  let streak = 0;
  while (dates.has(localStudyDate(day))) {
    streak++;
    day.setDate(day.getDate()-1);
  }
  return streak;
}
