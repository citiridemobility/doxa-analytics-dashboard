export type PeriodView = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const PERIOD_VIEWS: Array<{ id: PeriodView; label: string }> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

export const utcDayKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const utcMonthKey = (date = new Date()) => utcDayKey(date).slice(0, 7);
export const utcYearKey = (date = new Date()) => utcDayKey(date).slice(0, 4);

export function addUtcDays(day: string, delta: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function monthLabel(monthKey: string) {
  return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function shortDayLabel(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function monthEndDay(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(last).padStart(2, '0')}`;
}

export function buildMonthOptions(earliestDay?: string | null, latestDay?: string | null) {
  const current = utcMonthKey();
  const startKey = (earliestDay || current).slice(0, 7);
  const endKey = [((latestDay || current).slice(0, 7)), current].sort()[1];
  const months: Array<{ value: string; label: string }> = [];
  const cursor = new Date(`${startKey}-01T00:00:00Z`);
  const end = new Date(`${endKey}-01T00:00:00Z`);

  while (cursor.getTime() <= end.getTime()) {
    const value = cursor.toISOString().slice(0, 7);
    months.push({ value, label: monthLabel(value) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months.reverse();
}

export function buildYearOptions(earliestDay?: string | null, latestDay?: string | null) {
  const current = Number(utcYearKey());
  const start = Number((earliestDay || utcYearKey()).slice(0, 4));
  const end = Math.max(Number((latestDay || utcYearKey()).slice(0, 4)), current);
  const years: Array<{ value: string; label: string }> = [];
  for (let year = end; year >= start; year -= 1) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

export function resolvePeriodWindow(
  view: PeriodView,
  monthKey: string,
  yearKey: string,
  today = utcDayKey(),
) {
  if (view === 'daily') {
    return { from: today, to: today, caption: 'Today' };
  }

  if (view === 'weekly') {
    return { from: addUtcDays(today, -6), to: today, caption: 'Last 7 days' };
  }

  if (view === 'monthly') {
    const from = `${monthKey}-01`;
    const end = monthEndDay(monthKey);
    return { from, to: end > today ? today : end, caption: monthLabel(monthKey) };
  }

  const from = `${yearKey}-01-01`;
  const end = `${yearKey}-12-31`;
  return { from, to: end > today ? today : end, caption: yearKey };
}

export function filterByDayRange<T extends { day: string }>(points: T[] | undefined, from: string, to: string) {
  return (points || []).filter((point) => point.day >= from && point.day <= to);
}

export function sumSeries(points: Array<{ value: number }>) {
  return points.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
}

function weekStartDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (dayNum - 1));
  return date.toISOString().slice(0, 10);
}

export function toChartSeries(
  points: Array<{ day: string; value: number }>,
  view: PeriodView,
  today = utcDayKey(),
) {
  if (view === 'daily') {
    return filterByDayRange(points, addUtcDays(today, -13), today).map((point) => ({
      label: shortDayLabel(point.day),
      value: point.value,
    }));
  }

  if (view === 'weekly') {
    const sliced = filterByDayRange(points, addUtcDays(today, -83), today);
    const buckets = new Map<string, { label: string; value: number }>();
    for (const point of sliced) {
      const start = weekStartDay(point.day);
      const current = buckets.get(start) || { label: `W/c ${shortDayLabel(start)}`, value: 0 };
      current.value += point.value;
      buckets.set(start, current);
    }
    return Array.from(buckets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, row]) => row);
  }

  if (view === 'yearly') {
    const buckets = new Map<string, number>();
    for (const point of points) {
      const month = point.day.slice(0, 7);
      buckets.set(month, (buckets.get(month) || 0) + point.value);
    }
    return Array.from(buckets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, value]) => ({
        label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        value,
      }));
  }

  return points.map((point) => ({
    label: shortDayLabel(point.day),
    value: point.value,
  }));
}

export function groupRowsByGrain<T extends { day: string }>(
  rows: T[],
  view: PeriodView,
  numericKeys: Array<keyof T>,
  today = utcDayKey(),
) {
  const source =
    view === 'daily'
      ? filterByDayRange(rows, addUtcDays(today, -13), today)
      : view === 'weekly'
        ? filterByDayRange(rows, addUtcDays(today, -83), today)
        : rows;

  if (view === 'daily' || view === 'monthly') {
    return source.map((row) => ({ ...row, label: shortDayLabel(row.day) }));
  }

  const bucketKey = (day: string) => (view === 'weekly' ? weekStartDay(day) : day.slice(0, 7));
  const labelFor = (key: string) =>
    view === 'weekly'
      ? `W/c ${shortDayLabel(key)}`
      : new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

  const buckets = new Map<string, Record<string, number | string>>();
  for (const row of source) {
    const key = bucketKey(row.day);
    const current = buckets.get(key) ?? { label: labelFor(key) };
    for (const field of numericKeys) {
      const name = String(field);
      current[name] = (Number(current[name]) || 0) + (Number(row[field]) || 0);
    }
    buckets.set(key, current);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row);
}
