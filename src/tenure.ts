export function completedServiceYears(workStartDate: string, now = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workStartDate);
  if (!match) return 0;
  const [, year, month, day] = match.map(Number);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return 0;
  const anniversaryDay = Math.min(day, new Date(now.getFullYear(), month, 0).getDate());
  const anniversary = new Date(now.getFullYear(), month - 1, anniversaryDay);
  return Math.max(0, now.getFullYear() - year - (now < anniversary ? 1 : 0));
}
