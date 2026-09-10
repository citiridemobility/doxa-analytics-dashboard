import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SeriesPoint } from './api';
import {
  PERIOD_VIEWS,
  buildMonthOptions,
  buildYearOptions,
  filterByDayRange,
  resolvePeriodWindow,
  sumSeries,
  toChartSeries,
  utcMonthKey,
  utcYearKey,
  type PeriodView,
} from './period';
import type { Palette } from './theme';
import { FONT_FAMILY } from './theme';

const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value || 0);

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value || 0);

type ProductDashboardProps = {
  title: string;
  countNoun: string;
  countSeries: SeriesPoint[];
  volumeSeries: SeriesPoint[];
  feeSeries: SeriesPoint[];
  color: string;
  colors: Palette;
  earliestDay?: string | null;
  latestDay?: string | null;
  stagger?: number;
  className?: string;
};

export function ProductDashboard({
  title,
  countNoun,
  countSeries,
  volumeSeries,
  feeSeries,
  color,
  colors,
  earliestDay,
  latestDay,
  stagger = 0,
  className,
}: ProductDashboardProps) {
  const [view, setView] = useState<PeriodView>('monthly');
  const [month, setMonth] = useState(utcMonthKey);
  const [year, setYear] = useState(utcYearKey);

  const monthOptions = useMemo(
    () => buildMonthOptions(earliestDay, latestDay),
    [earliestDay, latestDay],
  );
  const yearOptions = useMemo(
    () => buildYearOptions(earliestDay, latestDay),
    [earliestDay, latestDay],
  );

  const window = resolvePeriodWindow(view, month, year);
  const countsInWindow = filterByDayRange(countSeries, window.from, window.to);
  const volumeInWindow = filterByDayRange(volumeSeries, window.from, window.to);
  const feesInWindow = filterByDayRange(feeSeries, window.from, window.to);
  const count = sumSeries(countsInWindow);
  const volumeUsd = sumSeries(volumeInWindow);
  const feeUsd = sumSeries(feesInWindow);
  const chartSource = view === 'monthly' || view === 'yearly' ? volumeInWindow : volumeSeries;
  const chartData = toChartSeries(chartSource, view);
  const hasChart = chartData.some((row) => row.value > 0);

  const tooltipStyle = {
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.primary}`,
    borderRadius: 10,
    color: colors.text.primary,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: 500,
  };
  const tick = {
    fill: colors.text.tertiary,
    fontSize: 10,
    fontFamily: FONT_FAMILY,
    fontWeight: 500,
  };

  return (
    <div className={`panel product-dash reveal ${className || ''}`.trim()} style={{ ['--stagger' as string]: String(stagger) }}>
      <div className="panel-header product-dash-header">
        <div>
          <h2>{title}</h2>
          <p className="caption">{window.caption}</p>
        </div>
        <div className="panel-controls">
          <div className="period-tabs" role="tablist" aria-label={`${title} time range`}>
            {PERIOD_VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={view === option.id}
                className={view === option.id ? 'is-active' : undefined}
                onClick={() => setView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            className="select"
            value={monthOptions.some((option) => option.value === month) ? month : monthOptions[0]?.value || month}
            onChange={(event) => {
              setMonth(event.target.value);
              setView('monthly');
            }}
            aria-label={`${title} month`}
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {view === 'yearly' ? (
            <select
              className="select"
              value={yearOptions.some((option) => option.value === year) ? year : yearOptions[0]?.value || year}
              onChange={(event) => setYear(event.target.value)}
              aria-label={`${title} year`}
            >
              {yearOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="product-dash-metrics">
        <div className="metric-card compact">
          <span>Volume</span>
          <strong>{formatUsd(volumeUsd)}</strong>
        </div>
        <div className="metric-card compact">
          <span>{countNoun}</span>
          <strong>{formatNumber(count)}</strong>
        </div>
        <div className="metric-card compact">
          <span>Fees</span>
          <strong>{formatUsd(feeUsd)}</strong>
        </div>
      </div>

      <div className="chart-wrap">
        {hasChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatUsd(value)} />
              <Line type="monotone" dataKey="value" name="Volume" stroke={color} strokeWidth={2.25} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-banner">No {title.toLowerCase()} volume in this range yet.</div>
        )}
      </div>
    </div>
  );
}
