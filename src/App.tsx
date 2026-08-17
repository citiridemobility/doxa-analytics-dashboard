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
  recordDownloadCount,
  syncUptodownDownloads,
  type DashboardSummary,
  type PieSlice,
  type SeriesPoint,
} from './api';
import { getPalette, FONT_FAMILY, type Palette, type ThemeMode } from './theme';

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

const emptyCategory = { count: 0, volumeUsd: 0, feeUsd: 0 };

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
  bills: colors.chart.soft,
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

function mapSeries(points: SeriesPoint[] | undefined) {
  return (points || []).map((point) => ({
    day: shortDay(point.day),
    value: point.value,
  }));
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('doxa-analytics-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [manualDownloads, setManualDownloads] = useState('');
  const [uptodownAppUrl, setUptodownAppUrl] = useState('');
  const [txFilter, setTxFilter] = useState<'all' | 'swap' | 'bridge' | 'xchange' | 'bills'>('all');
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

  const loadDashboard = async (rangeDays = days) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboard(rangeDays);
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard(days);
  }, [days]);

  const activityBreakdown = useMemo(() => {
    if (!summary?.series.activityBreakdown) return [];
    return summary.series.activityBreakdown.map((row) => ({
      ...row,
      day: shortDay(row.day),
    }));
  }, [summary]);

  const moneySeries = useMemo(() => {
    if (!summary) return [];
    return summary.series.volumeUsdByDay.map((point, index) => ({
      day: shortDay(point.day),
      volumeUsd: point.value,
      feeUsd: summary.series.feeUsdByDay[index]?.value ?? 0,
    }));
  }, [summary]);

  const productVolumeSeries = useMemo(() => {
    if (!summary) return [];
    return summary.series.swapVolumeByDay.map((point, index) => ({
      day: shortDay(point.day),
      swap: point.value,
      bridge: summary.series.bridgeVolumeByDay[index]?.value ?? 0,
      xchangeBuy: summary.series.xchangeBuyVolumeByDay[index]?.value ?? 0,
      xchangeSell: summary.series.xchangeSellVolumeByDay[index]?.value ?? 0,
      bills: summary.series.billsVolumeByDay[index]?.value ?? 0,
    }));
  }, [summary]);

  const categoryPie = useMemo(() => {
    const slices = summary?.breakdowns.categories || [];
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

  const uptodownHistory = useMemo(() => {
    if (!summary) return [];
    return summary.downloads.history
      .filter((row) => row.source === 'uptodown')
      .map((row) => ({
        day: shortDay(row.recordedAt.slice(0, 10)),
        downloads: row.downloadCount,
      }));
  }, [summary]);

  const filteredTransactions = useMemo(() => {
    const rows = summary?.recentTransactions || [];
    if (txFilter === 'all') return rows;
    if (txFilter === 'xchange') {
      return rows.filter((row) => row.category === 'xchange' || row.trackedCategory?.startsWith('xchange'));
    }
    return rows.filter((row) => row.category === txFilter || row.trackedCategory === txFilter);
  }, [summary, txFilter]);

  useEffect(() => {
    setTxVisibleCount(TX_PAGE_SIZE);
  }, [txFilter, days, summary?.generatedAt]);

  const visibleTransactions = useMemo(
    () => filteredTransactions.slice(0, txVisibleCount),
    [filteredTransactions, txVisibleCount],
  );

  const canLoadMoreTransactions = txVisibleCount < filteredTransactions.length;

  const handleSyncUptodown = async () => {
    setBusyAction('sync');
    setError(null);
    try {
      await syncUptodownDownloads(uptodownAppUrl.trim() || undefined);
      await loadDashboard(days);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Uptodown sync failed';
      setError(
        /uptodown.?url.?missing|Set DOXA_UPTODOWN_APP_URL/i.test(message)
          ? 'Uptodown sync needs an app page URL. Paste it below, or set DOXA_UPTODOWN_APP_URL on the backend.'
          : message,
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleRecordDownloads = async () => {
    const count = Number(manualDownloads.replace(/,/g, ''));
    if (!Number.isInteger(count) || count < 0) {
      setError('Enter a whole-number download count.');
      return;
    }

    setBusyAction('record');
    setError(null);
    try {
      await recordDownloadCount(count);
      setManualDownloads('');
      await loadDashboard(days);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record downloads');
    } finally {
      setBusyAction(null);
    }
  };

  const tooltipStyle = chartTooltipStyle(colors);
  const tick = axisTick(colors);
  const products = productColors(colors);
  const series = colors.chart.series;

  const swap = summary?.totals.swap || emptyCategory;
  const bridge = summary?.totals.bridge || emptyCategory;
  const xchangeBuy = summary?.totals.xchangeBuy || emptyCategory;
  const xchangeSell = summary?.totals.xchangeSell || emptyCategory;
  const bills = summary?.totals.bills || emptyCategory;

  const hasActivity = activityBreakdown.some(
    (row) => row.swap + row.bridge + row.xchangeBuy + row.xchangeSell + row.bills > 0,
  );
  const hasProductVolume = productVolumeSeries.some(
    (row) => row.swap + row.bridge + row.xchangeBuy + row.xchangeSell + row.bills > 0,
  );

  return (
    <div className={`app-shell ${loading && !summary ? 'is-loading' : 'is-ready'}`}>
      <div className="atmosphere" aria-hidden="true" />
      <header className="topbar reveal" style={{ ['--stagger' as string]: '0' }}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Doxa Analytics</h1>
            <p>Onchain activity, product volume, and fee revenue</p>
          </div>
        </div>
        <div className="topbar-actions">
          <select className="select" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="btn" type="button" onClick={() => void loadDashboard(days)} disabled={loading}>
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
          <MetricCard label="Total wallets" value={formatNumber(summary?.totals.wallets ?? 0)} hint={`Last ${days} days`} stagger={2} />
          <MetricCard label="Transactions" value={formatNumber(summary?.totals.transactions ?? 0)} hint={`${formatNumber(summary?.totals.completedTransactions ?? 0)} completed`} stagger={3} />
          <MetricCard label="Total volume" value={formatUsd(summary?.totals.volumeUsd ?? 0)} hint="All products" stagger={4} />
          <MetricCard label="Fees generated" value={formatUsd(summary?.totals.feeUsd ?? 0)} hint="Platform fees" stagger={5} />
          <MetricCard label="Uptodown downloads" value={formatNumber(summary?.totals.uptodownDownloads ?? 0)} hint="Latest snapshot" stagger={6} />
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '7' }}>Products</p>
        <section className="metrics-grid">
          <MetricCard label="Swap volume" value={formatUsd(swap.volumeUsd)} hint={`${formatNumber(swap.count)} swaps`} stagger={8} />
          <MetricCard label="Bridge volume" value={formatUsd(bridge.volumeUsd)} hint={`${formatNumber(bridge.count)} bridges`} stagger={9} />
          <MetricCard label="Xchange buy" value={formatUsd(xchangeBuy.volumeUsd)} hint={`${formatNumber(xchangeBuy.count)} buys`} stagger={10} />
          <MetricCard label="Xchange sell" value={formatUsd(xchangeSell.volumeUsd)} hint={`${formatNumber(xchangeSell.count)} sells`} stagger={11} />
          <MetricCard label="Bills volume" value={formatUsd(bills.volumeUsd)} hint={`${formatNumber(bills.count)} bills`} stagger={12} />
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '13' }}>Activity</p>
        <section className="panel-grid">
          <div className="panel reveal" style={{ ['--stagger' as string]: '14' }}>
            <div className="panel-header">
              <div>
                <h2>Daily product activity</h2>
                <p className="caption">Swap · Bridge · Xchange · Bills</p>
              </div>
            </div>
            <div className="chart-wrap tall">
              {hasActivity ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityBreakdown}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontFamily: FONT_FAMILY, fontWeight: 600 }} itemStyle={{ fontFamily: FONT_FAMILY }} />
                    <Legend wrapperStyle={legendStyle(colors)} formatter={(value) => categoryLabel(String(value))} />
                    <Bar dataKey="swap" name="Swap" stackId="activity" fill={products.swap} />
                    <Bar dataKey="bridge" name="Bridge" stackId="activity" fill={products.bridge} />
                    <Bar dataKey="xchangeBuy" name="Xchange buy" stackId="activity" fill={products.xchangeBuy} />
                    <Bar dataKey="xchangeSell" name="Xchange sell" stackId="activity" fill={products.xchangeSell} />
                    <Bar dataKey="bills" name="Bills" stackId="activity" fill={products.bills} radius={[4, 4, 0, 0]} />
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
                <h2>Daily product volume</h2>
                <p className="caption">USD volume by product</p>
              </div>
            </div>
            <div className="chart-wrap tall">
              {hasProductVolume ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={productVolumeSeries}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatUsd(value)} labelStyle={{ fontFamily: FONT_FAMILY, fontWeight: 600 }} itemStyle={{ fontFamily: FONT_FAMILY }} />
                    <Legend wrapperStyle={legendStyle(colors)} formatter={(value) => categoryLabel(String(value))} />
                    <Area type="monotone" dataKey="swap" name="Swap" stackId="volume" stroke={products.swap} fill={products.swap} fillOpacity={0.22} />
                    <Area type="monotone" dataKey="bridge" name="Bridge" stackId="volume" stroke={products.bridge} fill={products.bridge} fillOpacity={0.22} />
                    <Area type="monotone" dataKey="xchangeBuy" name="Xchange buy" stackId="volume" stroke={products.xchangeBuy} fill={products.xchangeBuy} fillOpacity={0.22} />
                    <Area type="monotone" dataKey="xchangeSell" name="Xchange sell" stackId="volume" stroke={products.xchangeSell} fill={products.xchangeSell} fillOpacity={0.22} />
                    <Area type="monotone" dataKey="bills" name="Bills" stackId="volume" stroke={products.bills} fill={products.bills} fillOpacity={0.22} />
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
                <p className="caption">Total volume vs platform fees</p>
              </div>
            </div>
            <div className="chart-wrap tall">
              {moneySeries.some((row) => row.volumeUsd > 0 || row.feeUsd > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={moneySeries}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
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

        <p className="section-label reveal" style={{ ['--stagger' as string]: '18' }}>Product detail</p>
        <section className="panel-grid three">
          <div className="panel reveal" style={{ ['--stagger' as string]: '19' }}>
            <div className="panel-header">
              <div>
                <h2>Swap activity</h2>
                <p className="caption">Daily swap count</p>
              </div>
            </div>
            <div className="chart-wrap">
              {mapSeries(summary?.series.swapByDay).some((row) => row.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mapSeries(summary?.series.swapByDay)}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={axisTick(colors, 10)} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick(colors, 10)} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="Swap" fill={products.swap} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No swaps yet." />
              )}
            </div>
          </div>

          <div className="panel reveal" style={{ ['--stagger' as string]: '20' }}>
            <div className="panel-header">
              <div>
                <h2>Bridge activity</h2>
                <p className="caption">Daily bridge count</p>
              </div>
            </div>
            <div className="chart-wrap">
              {mapSeries(summary?.series.bridgeByDay).some((row) => row.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mapSeries(summary?.series.bridgeByDay)}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={axisTick(colors, 10)} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick(colors, 10)} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="Bridge" fill={products.bridge} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No bridges yet." />
              )}
            </div>
          </div>

          <div className="panel reveal" style={{ ['--stagger' as string]: '21' }}>
            <div className="panel-header">
              <div>
                <h2>Bills activity</h2>
                <p className="caption">Daily bills payments</p>
              </div>
            </div>
            <div className="chart-wrap">
              {mapSeries(summary?.series.billsByDay).some((row) => row.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mapSeries(summary?.series.billsByDay)}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={axisTick(colors, 10)} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick(colors, 10)} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="Bills" fill={products.bills} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No bills yet." />
              )}
            </div>
          </div>
        </section>

        <section className="panel-grid two-equal">
          <div className="panel reveal" style={{ ['--stagger' as string]: '22' }}>
            <div className="panel-header">
              <div>
                <h2>Xchange buy vs sell</h2>
                <p className="caption">Daily Xchange counts</p>
              </div>
            </div>
            <div className="chart-wrap">
              {(summary?.series.xchangeBuyByDay || []).some((row, index) => row.value > 0 || (summary?.series.xchangeSellByDay[index]?.value ?? 0) > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(summary?.series.xchangeBuyByDay || []).map((point, index) => ({
                      day: shortDay(point.day),
                      buy: point.value,
                      sell: summary?.series.xchangeSellByDay[index]?.value ?? 0,
                    }))}
                  >
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={legendStyle(colors)} formatter={(value) => categoryLabel(String(value))} />
                    <Bar dataKey="buy" name="Xchange buy" fill={products.xchangeBuy} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sell" name="Xchange sell" fill={products.xchangeSell} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No Xchange activity yet." />
              )}
            </div>
          </div>

          <div className="panel reveal" style={{ ['--stagger' as string]: '23' }}>
            <div className="panel-header">
              <div>
                <h2>Xchange mix</h2>
                <p className="caption">Buy vs sell share</p>
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
        <section className="panel-grid two-equal">
          <div className="panel reveal" style={{ ['--stagger' as string]: '25' }}>
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

          <div className="panel reveal" style={{ ['--stagger' as string]: '26' }}>
            <div className="panel-header">
              <div>
                <h2>Uptodown downloads</h2>
                <p className="caption">Store install snapshots</p>
              </div>
            </div>
            <div className="chart-wrap" style={{ height: 180 }}>
              {uptodownHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={uptodownHistory}>
                    <CartesianGrid stroke={colors.border.secondary} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="downloads" name="Downloads" stroke={colors.chart.primary} strokeWidth={2.25} dot={{ r: 3, fill: colors.chart.primary }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No Uptodown snapshots yet. Record a count after upload." />
              )}
            </div>
            <div className="downloads-row">
              <input
                className="input"
                placeholder="Manual download count"
                value={manualDownloads}
                onChange={(event) => setManualDownloads(event.target.value)}
              />
              <button className="btn" type="button" onClick={() => void handleRecordDownloads()} disabled={busyAction !== null}>
                {busyAction === 'record' ? 'Saving…' : 'Record count'}
              </button>
            </div>
            <div className="downloads-row" style={{ marginTop: 10 }}>
              <input
                className="input"
                placeholder="Uptodown app URL (optional if backend env is set)"
                value={uptodownAppUrl}
                onChange={(event) => setUptodownAppUrl(event.target.value)}
              />
              <button className="btn btn-accent" type="button" onClick={() => void handleSyncUptodown()} disabled={busyAction !== null}>
                {busyAction === 'sync' ? 'Syncing…' : 'Sync Uptodown'}
              </button>
            </div>
          </div>
        </section>

        <p className="section-label reveal" style={{ ['--stagger' as string]: '27' }}>Transactions</p>
        <section className="panel-grid">
          <div className="panel full reveal" style={{ ['--stagger' as string]: '28' }}>
            <div className="panel-header">
              <div>
                <h2>Transaction records</h2>
                <p className="caption">Swap · Bridge · Xchange · Bills</p>
              </div>
              <select className="select" value={txFilter} onChange={(event) => setTxFilter(event.target.value as typeof txFilter)}>
                <option value="all">All types</option>
                <option value="swap">Swap only</option>
                <option value="bridge">Bridge only</option>
                <option value="xchange">Xchange only</option>
                <option value="bills">Bills only</option>
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
                          <td className="col-time">{formatTimestamp(tx.occurredAt)}</td>
                          <td className="col-type">
                            <span className="badge accent">
                              {tx.category === 'xchange' && tx.xchangeMode
                                ? categoryLabel(`xchange-${tx.xchangeMode}`)
                                : categoryLabel(tx.trackedCategory || tx.category)}
                            </span>
                          </td>
                          <td className="col-asset">{formatTransactionAsset(tx)}</td>
                          <td className="col-wallet">
                            <div className="tx-cell-stack">
                              <span className="mono">{shorten(tx.walletAddress)}</span>
                              <span className="secondary">{tx.networkLabel}</span>
                            </div>
                          </td>
                          <td className="col-amount">
                            <div className="tx-cell-stack">
                              <span>{tx.amountText || '—'}</span>
                              <span className="secondary mono">{formatUsd(tx.amountUsd)}</span>
                            </div>
                          </td>
                          <td className="col-status">
                            <span className="badge">{tx.status}</span>
                          </td>
                          <td className="col-details">
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
    </div>
  );
}
