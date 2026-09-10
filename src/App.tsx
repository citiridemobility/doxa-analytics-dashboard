import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchDashboard,
  syncUptodownDownloads,
  type DashboardSummary,
  type PieSlice,
} from './api';
import { ProductDashboard } from './ProductDashboard';
import {
  PERIOD_VIEWS,
  buildMonthOptions,
  buildYearOptions,
  filterByDayRange,
  groupRowsByGrain,
  resolvePeriodWindow,
  sumSeries,
  utcMonthKey,
  utcYearKey,
  type PeriodView,
} from './period';
import { getPalette, FONT_FAMILY, type Palette, type ThemeMode } from './theme';
import doxaLogo from './assets/doxa-logo.png';

const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value || 0);

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value || 0);

const shortDay = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const shorten = (value?: string | null, size = 4) => {
  if (!value) return '—';
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
};

/** Consistent product / category labels across cards, charts, and table. */
const categoryLabel = (value?: string | null) => {
  switch (String(value || '').toLowerCase()) {
    case 'swap':
    case 'swaps':
      return 'Swap';
    case 'bridge':
    case 'bridges':
      return 'Bridge';
    case 'xchange':
      return 'Xchange';
    case 'xchange-buy':
    case 'buy':
    case 'xchange buy':
      return 'Xchange buy';
    case 'xchange-sell':
    case 'sell':
    case 'xchange sell':
      return 'Xchange sell';
    case 'bills':
      return 'Bills';
    case 'airtime':
      return 'Airtime';
    case 'data':
      return 'Data';
    case 'electricity':
    case 'light':
    case 'light bill':
      return 'Electricity';
    case 'token-transfer':
      return 'Token transfer';
    case 'transaction':
    case 'transfer':
      return 'Transfer';
    case 'volume':
    case 'volumeusd':
      return 'Volume';
    case 'fees':
    case 'feeusd':
      return 'Fees';
    case 'downloads':
      return 'Downloads';
    case 'transactions':
      return 'Transactions';
    default:
      return value ? String(value).replace(/[-_]/g, ' ') : 'Other';
  }
};

const HISTORY_DAYS = 365;

const WEBSITE_DOWNLOAD_SOURCES = ['apk', 'website'] as const;

const sumTotalDownloads = (summary: DashboardSummary | null) => {
  if (!summary) return 0;

  const bySource = new Map(
    summary.downloads.latestBySource.map((row) => [row.source, row.downloadCount]),
  );
  const website =
    bySource.get('apk') ??
    bySource.get('website') ??
    summary.totals.websiteDownloads ??
    0;

  return (
    (bySource.get('uptodown') ?? summary.totals.uptodownDownloads ?? 0) +
    website +
    (bySource.get('app_store') ?? 0) +
    (bySource.get('other') ?? 0)
  );
};

const buildDownloadHistoryFromSources = (
  summary: DashboardSummary | null,
  sources: readonly string[],
) => {
  if (!summary) return [];

  const sourceSet = new Set(sources);
  const snapshots = summary.downloads.history
    .filter((row) => sourceSet.has(row.source))
    .slice()
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  if (!snapshots.length) return [];

  const dayKeys = summary.series.volumeUsdByDay.map((point) => point.day);
  let snapshotIndex = 0;
  let latestCount = 0;
  let hasStarted = false;

  return dayKeys.map((day) => {
    while (
      snapshotIndex < snapshots.length &&
      snapshots[snapshotIndex].recordedAt.slice(0, 10) <= day
    ) {
      latestCount = snapshots[snapshotIndex].downloadCount;
      hasStarted = true;
      snapshotIndex += 1;
    }

    return {
      day: shortDay(day),
      downloads: hasStarted ? latestCount : 0,
    };
  });
};

const formatTransactionAsset = (tx: {
  category: string;
  assetLabel?: string | null;
  billType?: string | null;
  summaryAmount?: string | null;
  tokenSymbol?: string | null;
  amountText?: string | null;
}) => {
  if (tx.assetLabel?.trim()) return tx.assetLabel.trim();
  if (tx.summaryAmount?.trim()) return tx.summaryAmount.trim();

  if (tx.category === 'bills') {
    const billLabel = categoryLabel(tx.billType || 'bills');
    return tx.tokenSymbol ? `${billLabel} · ${tx.tokenSymbol}` : billLabel;
  }

  if (tx.tokenSymbol?.trim()) return tx.tokenSymbol.trim();
  if (tx.amountText?.trim()) return tx.amountText.trim();
  return '—';
};

const axisTick = (colors: Palette, size = 11) => ({
  fill: colors.text.tertiary,
  fontSize: size,
  fontFamily: FONT_FAMILY,
  fontWeight: 500,
});

const chartTooltipStyle = (colors: Palette) => ({
  background: colors.bg.secondary,
  border: `1px solid ${colors.border.primary}`,
  borderRadius: 10,
  color: colors.text.primary,
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  fontWeight: 500,
});

const legendStyle = (colors: Palette) => ({
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  fontWeight: 500,
  color: colors.text.secondary,
});

const productColors = (colors: Palette) => ({
  swap: colors.chart.primary,
  bridge: colors.chart.secondary,
  xchangeBuy: colors.chart.tertiary,
  xchangeSell: colors.chart.muted,
});

function MetricCard({
  label,
  value,
  hint,
  stagger = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  stagger?: number;
}) {
  return (
    <div className="metric-card reveal" style={{ ['--stagger' as string]: String(stagger) }}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </div>
  );
}

function PiePercentTooltip({
  active,
  payload,
  colors,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    percent?: number;
    payload?: PieSlice & { total?: number };
  }>;
  colors: Palette;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item.value ?? item.payload?.value) || 0;
  const total = Number(item.payload?.total) || 0;
  const percentFromItem = typeof item.percent === 'number' && item.percent > 0 ? item.percent * 100 : null;
  const percent = percentFromItem ?? (total > 0 ? (value / total) * 100 : 0);

  return (
    <div className="tooltip-card" style={{ background: colors.bg.secondary, borderColor: colors.border.primary, fontFamily: FONT_FAMILY }}>
      <strong style={{ color: colors.text.primary, fontFamily: FONT_FAMILY }}>{categoryLabel(String(item.name || item.payload?.name || ''))}</strong>
      <p style={{ color: colors.text.secondary, fontFamily: FONT_FAMILY }}>
        {formatNumber(value)} · {percent.toFixed(1)}%
      </p>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return <div className="empty-banner">{message}</div>;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('doxa-analytics-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [overviewView, setOverviewView] = useState<PeriodView>('monthly');
  const [overviewMonth, setOverviewMonth] = useState(utcMonthKey);
  const [overviewYear, setOverviewYear] = useState(utcYearKey);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | 'swap' | 'bridge' | 'xchange'>('all');
  const [txVisibleCount, setTxVisibleCount] = useState(25);
  const TX_PAGE_SIZE = 25;

  const colors = useMemo(() => getPalette(theme), [theme]);

  useEffect(() => {
    localStorage.setItem('doxa-analytics-theme', theme);
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', colors.bg.primary);
    root.style.setProperty('--bg-secondary', colors.bg.secondary);
    root.style.setProperty('--bg-dark1', colors.bg.dark1);
    root.style.setProperty('--text-primary', colors.text.primary);
    root.style.setProperty('--text-secondary', colors.text.secondary);
    root.style.setProperty('--text-tertiary', colors.text.tertiary);
    root.style.setProperty('--border', colors.border.primary);
    root.style.setProperty('--accent', colors.accent.primary);
    root.style.setProperty('--error', colors.status.error);
    document.body.style.background = colors.bg.primary;
    document.body.style.color = colors.text.primary;
  }, [colors, theme]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboard(HISTORY_DAYS);
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const overviewWindow = useMemo(
    () => resolvePeriodWindow(overviewView, overviewMonth, overviewYear),
    [overviewView, overviewMonth, overviewYear],
  );

  const historySpan = useMemo(() => {
    const days = summary?.series.volumeUsdByDay || [];
    return {
      earliest: days[0]?.day ?? null,
      latest: days[days.length - 1]?.day ?? null,
    };
  }, [summary]);

  const monthOptions = useMemo(
    () => buildMonthOptions(historySpan.earliest, historySpan.latest),
    [historySpan],
  );
  const yearOptions = useMemo(
    () => buildYearOptions(historySpan.earliest, historySpan.latest),
    [historySpan],
  );

  const overviewTotals = useMemo(() => {
    if (!summary) {
      return { wallets: 0, transactions: 0, volumeUsd: 0, feeUsd: 0 };
    }
    const inWindow = <T extends { day: string; value: number }>(points: T[]) =>
      filterByDayRange(points, overviewWindow.from, overviewWindow.to);
    return {
      wallets: sumSeries(inWindow(summary.series.walletsByDay)),
      transactions: sumSeries(inWindow(summary.series.transactionsByDay)),
      volumeUsd: sumSeries(inWindow(summary.series.volumeUsdByDay)),
      feeUsd: sumSeries(inWindow(summary.series.feeUsdByDay)),
    };
  }, [summary, overviewWindow]);

  const activityBreakdown = useMemo(() => {
    const rows = summary?.series.activityBreakdown || [];
    const source =
      overviewView === 'monthly' || overviewView === 'yearly'
        ? filterByDayRange(rows, overviewWindow.from, overviewWindow.to)
        : rows;
    return groupRowsByGrain(source, overviewView, ['swap', 'bridge', 'xchangeBuy', 'xchangeSell']);
  }, [summary, overviewView, overviewWindow]);

  const moneySeries = useMemo(() => {
    if (!summary) return [];
    const rows = summary.series.volumeUsdByDay.map((point, index) => ({
      day: point.day,
      volumeUsd: point.value,
      feeUsd: summary.series.feeUsdByDay[index]?.value ?? 0,
    }));
    const source =
      overviewView === 'monthly' || overviewView === 'yearly'
        ? filterByDayRange(rows, overviewWindow.from, overviewWindow.to)
        : rows;
    return groupRowsByGrain(source, overviewView, ['volumeUsd', 'feeUsd']);
  }, [summary, overviewView, overviewWindow]);

  const productVolumeSeries = useMemo(() => {
    if (!summary) return [];
    const rows = summary.series.swapVolumeByDay.map((point, index) => ({
      day: point.day,
      swap: point.value,
      bridge: summary.series.bridgeVolumeByDay[index]?.value ?? 0,
      xchangeBuy: summary.series.xchangeBuyVolumeByDay[index]?.value ?? 0,
      xchangeSell: summary.series.xchangeSellVolumeByDay[index]?.value ?? 0,
    }));
    const source =
      overviewView === 'monthly' || overviewView === 'yearly'
        ? filterByDayRange(rows, overviewWindow.from, overviewWindow.to)
        : rows;
    return groupRowsByGrain(source, overviewView, ['swap', 'bridge', 'xchangeBuy', 'xchangeSell']);
  }, [summary, overviewView, overviewWindow]);

  const categoryPie = useMemo(() => {
    const slices = (summary?.breakdowns.categories || []).filter(
      (slice) => String(slice.name).toLowerCase() !== 'bills',
    );
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    return slices.map((slice) => ({ ...slice, total }));
  }, [summary]);

  const xchangePie = useMemo(() => {
    const slices = summary?.breakdowns.xchangeModes || [];
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    return slices.map((slice) => ({
      ...slice,
      name: slice.name === 'buy' ? 'Xchange buy' : slice.name === 'sell' ? 'Xchange sell' : slice.name,
      total,
    }));
  }, [summary]);

  const uptodownDownloadHistory = useMemo(
    () => buildDownloadHistoryFromSources(summary, ['uptodown']),
    [summary],
  );

  const websiteDownloadHistory = useMemo(
    () => buildDownloadHistoryFromSources(summary, WEBSITE_DOWNLOAD_SOURCES),
    [summary],
  );

  const uptodownLatest = summary?.downloads.latestBySource.find((row) => row.source === 'uptodown');
  const uptodownDownloadTotal =
    uptodownLatest?.downloadCount ??
    summary?.totals.uptodownDownloads ??
    0;

  const apkLatest = summary?.downloads.latestBySource.find((row) => row.source === 'apk');
  const websiteLatest = summary?.downloads.latestBySource.find((row) => row.source === 'website');
  const websiteDownloadTotal =
    apkLatest?.downloadCount ??
    websiteLatest?.downloadCount ??
    summary?.totals.websiteDownloads ??
    0;

  const totalDownloadTotal = useMemo(() => sumTotalDownloads(summary), [summary]);

  const handleSyncUptodown = async () => {
    setBusyAction('sync-uptodown');
    setError(null);
    try {
      await syncUptodownDownloads();
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uptodown sync failed');
    } finally {
      setBusyAction(null);
    }
  };

  const filteredTransactions = useMemo(() => {
    const rows = summary?.recentTransactions || [];
    const inWindow = rows.filter((row) => {
      const day = row.occurredAt.slice(0, 10);
      return day >= overviewWindow.from && day <= overviewWindow.to;
    });
    if (txFilter === 'all') return inWindow;
    if (txFilter === 'xchange') {
      return inWindow.filter((row) => row.category === 'xchange' || row.trackedCategory?.startsWith('xchange'));
    }
    return inWindow.filter((row) => row.category === txFilter || row.trackedCategory === txFilter);
  }, [summary, txFilter, overviewWindow]);

  useEffect(() => {
    setTxVisibleCount(TX_PAGE_SIZE);
  }, [txFilter, overviewWindow.from, overviewWindow.to, summary?.generatedAt]);

  const visibleTransactions = useMemo(
    () => filteredTransactions.slice(0, txVisibleCount),
    [filteredTransactions, txVisibleCount],
  );

  const canLoadMoreTransactions = txVisibleCount < filteredTransactions.length;

  const tooltipStyle = chartTooltipStyle(colors);
  const tick = axisTick(colors);
  const products = productColors(colors);
  const series = colors.chart.series;

  const hasActivity = activityBreakdown.some(
    (row) => Number(row.swap) + Number(row.bridge) + Number(row.xchangeBuy) + Number(row.xchangeSell) > 0,
  );
  const hasProductVolume = productVolumeSeries.some(
    (row) => Number(row.swap) + Number(row.bridge) + Number(row.xchangeBuy) + Number(row.xchangeSell) > 0,
  );

  return (
    <div className={`app-shell ${loading && !summary ? 'is-loading' : 'is-ready'}`}>
      <div className="atmosphere" aria-hidden="true" />
      <header className="topbar reveal" style={{ ['--stagger' as string]: '0' }}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img src={doxaLogo} alt="" width={28} height={28} />
          </div>
          <div>
            <h1>Doxa Analytics</h1>
            <p>Onchain activity, product volume, and fee revenue</p>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="period-tabs" role="tablist" aria-label="Overview time range">
            {PERIOD_VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={overviewView === option.id}
                className={overviewView === option.id ? 'is-active' : undefined}
                onClick={() => setOverviewView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            className="select"
            value={monthOptions.some((option) => option.value === overviewMonth) ? overviewMonth : monthOptions[0]?.value || overviewMonth}
            onChange={(event) => {
              setOverviewMonth(event.target.value);
              setOverviewView('monthly');
            }}
            aria-label="Overview month"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {overviewView === 'yearly' ? (
            <select
              className="select"
              value={yearOptions.some((option) => option.value === overviewYear) ? overviewYear : yearOptions[0]?.value}
              onChange={(event) => setOverviewYear(event.target.value)}
              aria-label="Overview year"
            >
              {yearOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
          <button className="btn" type="button" onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn" type="button" onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </header>

      <main className="content">
        {loading && !summary ? <div className="empty-banner reveal pulse">Loading analytics…</div> : null}
        {error ? <div className="error-banner reveal">{error}</div> : null}

        <p className="section-label reveal" style={{ ['--stagger' as string]: '1' }}>Overview</p>
        <section className="metrics-grid">
          <MetricCard label="Total wallets" value={formatNumber(overviewTotals.wallets)} hint={overviewWindow.caption} stagger={2} />
          <MetricCard label="Transactions" value={formatNumber(overviewTotals.transactions)} hint={overviewWindow.caption} stagger={3} />
          <MetricCard label="Total volume" value={formatUsd(overviewTotals.volumeUsd)} hint="All products" stagger={4} />
          <MetricCard label="Fees generated" value={formatUsd(overviewTotals.feeUsd)} hint="Platform fees" stagger={5} />
        </section>
        <section className="metrics-grid">
          <MetricCard label="Total downloads" value={formatNumber(totalDownloadTotal)} hint="Uptodown + website" stagger={6} />
          <MetricCard label="Uptodown downloads" value={formatNumber(uptodownDownloadTotal)} hint="Latest Uptodown snapshot" stagger={7} />
          <MetricCard label="Website downloads" value={formatNumber(websiteDownloadTotal)} hint="Historical APK via doxawallet.com" stagger={8} />
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '9' }}>Products</p>
        <section className="panel-grid two-equal">
          <ProductDashboard
            title="Swap"
            countNoun="Swaps"
            countSeries={summary?.series.swapByDay || []}
            volumeSeries={summary?.series.swapVolumeByDay || []}
            feeSeries={summary?.series.swapFeeByDay || []}
            color={products.swap}
            colors={colors}
            earliestDay={historySpan.earliest}
            latestDay={historySpan.latest}
            stagger={10}
          />
          <ProductDashboard
            title="Bridge"
            countNoun="Bridges"
            countSeries={summary?.series.bridgeByDay || []}
            volumeSeries={summary?.series.bridgeVolumeByDay || []}
            feeSeries={summary?.series.bridgeFeeByDay || []}
            color={products.bridge}
            colors={colors}
            earliestDay={historySpan.earliest}
            latestDay={historySpan.latest}
            stagger={11}
          />
          <ProductDashboard
            title="Xchange buy"
            countNoun="Buys"
            countSeries={summary?.series.xchangeBuyByDay || []}
            volumeSeries={summary?.series.xchangeBuyVolumeByDay || []}
            feeSeries={summary?.series.xchangeBuyFeeByDay || []}
            color={products.xchangeBuy}
            colors={colors}
            earliestDay={historySpan.earliest}
            latestDay={historySpan.latest}
            stagger={12}
          />
          <ProductDashboard
            title="Xchange sell"
            countNoun="Sells"
            countSeries={summary?.series.xchangeSellByDay || []}
            volumeSeries={summary?.series.xchangeSellVolumeByDay || []}
            feeSeries={summary?.series.xchangeSellFeeByDay || []}
            color={products.xchangeSell}
            colors={colors}
            earliestDay={historySpan.earliest}
            latestDay={historySpan.latest}
            stagger={13}
          />
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '15' }}>Activity</p>
        <section className="panel-grid">
          <div className="panel reveal" style={{ ['--stagger' as string]: '14' }}>
            <div className="panel-header">
              <div>
                <h2>Product activity</h2>
                <p className="caption">{overviewWindow.caption}</p>
              </div>
            </div>
            <div className="chart-wrap tall">
              {hasActivity ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityBreakdown}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontFamily: FONT_FAMILY, fontWeight: 600 }} itemStyle={{ fontFamily: FONT_FAMILY }} />
                    <Legend wrapperStyle={legendStyle(colors)} formatter={(value) => categoryLabel(String(value))} />
                    <Bar dataKey="swap" name="Swap" stackId="activity" fill={products.swap} />
                    <Bar dataKey="bridge" name="Bridge" stackId="activity" fill={products.bridge} />
                    <Bar dataKey="xchangeBuy" name="Xchange buy" stackId="activity" fill={products.xchangeBuy} />
                    <Bar dataKey="xchangeSell" name="Xchange sell" stackId="activity" fill={products.xchangeSell} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No product activity in this range yet." />
              )}
            </div>
          </div>

          <div className="panel reveal" style={{ ['--stagger' as string]: '15' }}>
            <div className="panel-header">
              <div>
                <h2>Category mix</h2>
                <p className="caption">Share of recorded transactions</p>
              </div>
            </div>
            <div className="chart-wrap">
              {categoryPie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryPie} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} stroke={colors.bg.secondary} strokeWidth={2}>
                      {categoryPie.map((entry, index) => (
                        <Cell key={entry.name} fill={series[index % series.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PiePercentTooltip colors={colors} />} />
                    <Legend wrapperStyle={legendStyle(colors)} formatter={(value) => categoryLabel(String(value))} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No category data yet." />
              )}
            </div>
          </div>
        </section>

        <section className="panel-grid two-equal">
          <div className="panel reveal" style={{ ['--stagger' as string]: '16' }}>
            <div className="panel-header">
              <div>
                <h2>Product volume</h2>
                <p className="caption">{overviewWindow.caption}</p>
              </div>
            </div>
            <div className="chart-wrap tall">
              {hasProductVolume ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={productVolumeSeries}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatUsd(value)} labelStyle={{ fontFamily: FONT_FAMILY, fontWeight: 600 }} itemStyle={{ fontFamily: FONT_FAMILY }} />
                    <Legend wrapperStyle={legendStyle(colors)} formatter={(value) => categoryLabel(String(value))} />
                    <Area type="monotone" dataKey="swap" name="Swap" stackId="volume" stroke={products.swap} fill={products.swap} fillOpacity={0.22} />
                    <Area type="monotone" dataKey="bridge" name="Bridge" stackId="volume" stroke={products.bridge} fill={products.bridge} fillOpacity={0.22} />
                    <Area type="monotone" dataKey="xchangeBuy" name="Xchange buy" stackId="volume" stroke={products.xchangeBuy} fill={products.xchangeBuy} fillOpacity={0.22} />
                    <Area type="monotone" dataKey="xchangeSell" name="Xchange sell" stackId="volume" stroke={products.xchangeSell} fill={products.xchangeSell} fillOpacity={0.22} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No USD product volume in this range yet." />
              )}
            </div>
          </div>

          <div className="panel reveal" style={{ ['--stagger' as string]: '17' }}>
            <div className="panel-header">
              <div>
                <h2>Volume and fees</h2>
                <p className="caption">{overviewWindow.caption}</p>
              </div>
            </div>
            <div className="chart-wrap tall">
              {moneySeries.some((row) => Number(row.volumeUsd) > 0 || Number(row.feeUsd) > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={moneySeries}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatUsd(value)} labelStyle={{ fontFamily: FONT_FAMILY, fontWeight: 600 }} itemStyle={{ fontFamily: FONT_FAMILY }} />
                    <Legend wrapperStyle={legendStyle(colors)} formatter={(value) => categoryLabel(String(value))} />
                    <Line type="monotone" dataKey="volumeUsd" name="Volume" stroke={colors.chart.muted} strokeWidth={2.25} dot={false} />
                    <Line type="monotone" dataKey="feeUsd" name="Fees" stroke={colors.chart.primary} strokeWidth={2.25} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No volume or fee data yet." />
              )}
            </div>
          </div>
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '18' }}>Xchange mix</p>
        <section className="panel-grid">
          <div className="panel full reveal" style={{ ['--stagger' as string]: '23' }}>
            <div className="panel-header">
              <div>
                <h2>Xchange mix</h2>
                <p className="caption">Buy vs sell share in loaded history</p>
              </div>
            </div>
            <div className="chart-wrap">
              {xchangePie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={xchangePie} dataKey="value" nameKey="name" outerRadius={90} paddingAngle={2} stroke={colors.bg.secondary} strokeWidth={2}>
                      {xchangePie.map((entry, index) => (
                        <Cell key={entry.name} fill={index === 0 ? products.xchangeBuy : products.xchangeSell} />
                      ))}
                    </Pie>
                    <Tooltip content={<PiePercentTooltip colors={colors} />} />
                    <Legend wrapperStyle={legendStyle(colors)} formatter={(value) => categoryLabel(String(value))} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No Xchange mix yet." />
              )}
            </div>
          </div>
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '24' }}>Network and distribution</p>
        <section className="panel-grid">
          <div className="panel full reveal" style={{ ['--stagger' as string]: '25' }}>
            <div className="panel-header">
              <div>
                <h2>Network distribution</h2>
                <p className="caption">Transactions by network</p>
              </div>
            </div>
            <div className="chart-wrap">
              {(summary?.breakdowns.networks.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary?.breakdowns.networks ?? []} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid stroke={colors.border.secondary} horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={tick} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="Transactions" fill={colors.chart.primary} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No network data yet." />
              )}
            </div>
          </div>
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '25' }}>Downloads</p>
        <section className="panel-grid two-equal">
          <div className="panel reveal" style={{ ['--stagger' as string]: '26' }}>
            <div className="panel-header">
              <div>
                <h2>Uptodown downloads</h2>
                <p className="caption">{formatNumber(uptodownDownloadTotal)} total installs from Uptodown</p>
              </div>
            </div>
            <div className="chart-wrap tall">
              {uptodownDownloadHistory.some((row) => row.downloads > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={uptodownDownloadHistory}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatNumber(value)} labelStyle={{ fontFamily: FONT_FAMILY, fontWeight: 600 }} itemStyle={{ fontFamily: FONT_FAMILY }} />
                    <Legend wrapperStyle={legendStyle(colors)} />
                    <Line type="monotone" dataKey="downloads" name="Uptodown" stroke={colors.chart.primary} strokeWidth={2.25} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No Uptodown snapshots yet. Tap Sync Uptodown to pull the latest count." />
              )}
            </div>
            <div className="downloads-row">
              <button className="btn btn-accent" type="button" onClick={() => void handleSyncUptodown()} disabled={busyAction !== null}>
                {busyAction === 'sync-uptodown' ? 'Syncing…' : 'Sync Uptodown'}
              </button>
            </div>
          </div>

          <div className="panel reveal" style={{ ['--stagger' as string]: '27' }}>
            <div className="panel-header">
              <div>
                <h2>Website downloads</h2>
                <p className="caption">{formatNumber(websiteDownloadTotal)} completed APK downloads via doxawallet.com</p>
              </div>
            </div>
            <div className="chart-wrap tall">
              {websiteDownloadHistory.some((row) => row.downloads > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={websiteDownloadHistory}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatNumber(value)} labelStyle={{ fontFamily: FONT_FAMILY, fontWeight: 600 }} itemStyle={{ fontFamily: FONT_FAMILY }} />
                    <Legend wrapperStyle={legendStyle(colors)} />
                    <Line type="monotone" dataKey="downloads" name="Website" stroke={colors.chart.secondary} strokeWidth={2.25} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No website download history yet." />
              )}
            </div>
          </div>
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '27' }}>Transactions</p>
        <section className="panel-grid">
          <div className="panel full reveal" style={{ ['--stagger' as string]: '28' }}>
            <div className="panel-header">
              <div>
                <h2>Transaction records</h2>
                <p className="caption">Swap · Bridge · Xchange</p>
              </div>
              <select className="select" value={txFilter} onChange={(event) => setTxFilter(event.target.value as typeof txFilter)}>
                <option value="all">All types</option>
                <option value="swap">Swap only</option>
                <option value="bridge">Bridge only</option>
                <option value="xchange">Xchange only</option>
              </select>
            </div>

            {(filteredTransactions.length ?? 0) > 0 ? (
              <>
                <div className="table-wrap">
                  <table className="tx-table">
                    <thead>
                      <tr>
                        <th className="col-time">Time</th>
                        <th className="col-type">Type</th>
                        <th className="col-asset">Token / product</th>
                        <th className="col-wallet">Wallet / network</th>
                        <th className="col-amount">Amount</th>
                        <th className="col-status">Status</th>
                        <th className="col-details">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTransactions.map((tx) => (
                        <tr key={tx.eventId}>
                          <td className="col-time" data-label="Time">{formatTimestamp(tx.occurredAt)}</td>
                          <td className="col-type" data-label="Type">
                            <span className="badge accent">
                              {tx.category === 'xchange' && tx.xchangeMode
                                ? categoryLabel(`xchange-${tx.xchangeMode}`)
                                : categoryLabel(tx.trackedCategory || tx.category)}
                            </span>
                          </td>
                          <td className="col-asset" data-label="Token / product">{formatTransactionAsset(tx)}</td>
                          <td className="col-wallet" data-label="Wallet / network">
                            <div className="tx-cell-stack">
                              <span className="mono">{shorten(tx.walletAddress)}</span>
                              <span className="secondary">{tx.networkLabel}</span>
                            </div>
                          </td>
                          <td className="col-amount" data-label="Amount">
                            <div className="tx-cell-stack">
                              <span>{tx.amountText || '—'}</span>
                              <span className="secondary mono">{formatUsd(tx.amountUsd)}</span>
                            </div>
                          </td>
                          <td className="col-status" data-label="Status">
                            <span className="badge">{tx.status}</span>
                          </td>
                          <td className="col-details" data-label="Details">
                            {tx.explorerUrl ? (
                              <a className="link" href={tx.explorerUrl} target="_blank" rel="noreferrer">
                                View
                              </a>
                            ) : tx.txHash ? (
                              <span className="mono">{shorten(tx.txHash)}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer">
                  <p className="caption">
                    {visibleTransactions.length} of {filteredTransactions.length} rows loaded
                  </p>
                  {canLoadMoreTransactions ? (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => setTxVisibleCount((current) => current + TX_PAGE_SIZE)}
                    >
                      Load more
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <ChartEmpty message="No transactions in this filter yet." />
            )}
          </div>
        </section>
      </main>
      <footer className="site-footer reveal" style={{ ['--stagger' as string]: '29' }}>
        <a className="link" href="/legal/privacy-policy.html" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
        <span aria-hidden="true">·</span>
        <a className="link" href="/legal/terms-of-service.html" target="_blank" rel="noreferrer">
          Terms of Service
        </a>
      </footer>
    </div>
  );
}
