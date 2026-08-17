export type SeriesPoint = { day: string; value: number };
export type PieSlice = { name: string; value: number };

export type CategoryTotals = {
  count: number;
  volumeUsd: number;
  feeUsd: number;
};

export type RecentTransaction = {
  eventId: string;
  occurredAt: string;
  category: string;
  trackedCategory: string | null;
  xchangeMode: 'buy' | 'sell' | null;
  status: string;
  direction: string | null;
  networkId: string | null;
  networkLabel: string;
  tokenSymbol: string | null;
  amountText: string | null;
  amountUsd: number;
  platformFeeUsd: number;
  walletAddress: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  provider: string | null;
  reference: string | null;
  assetLabel: string | null;
  billType: 'airtime' | 'data' | 'electricity' | null;
  summaryAmount: string | null;
};

export type DashboardSummary = {
  rangeDays: number;
  generatedAt: string;
  totals: {
    wallets: number;
    transactions: number;
    completedTransactions: number;
    volumeUsd: number;
    feeUsd: number;
    uptodownDownloads: number;
    swap: CategoryTotals;
    bridge: CategoryTotals;
    xchangeBuy: CategoryTotals;
    xchangeSell: CategoryTotals;
    bills: CategoryTotals;
  };
  series: {
    walletsByDay: SeriesPoint[];
    transactionsByDay: SeriesPoint[];
    volumeUsdByDay: SeriesPoint[];
    feeUsdByDay: SeriesPoint[];
    swapByDay: SeriesPoint[];
    bridgeByDay: SeriesPoint[];
    xchangeBuyByDay: SeriesPoint[];
    xchangeSellByDay: SeriesPoint[];
    billsByDay: SeriesPoint[];
    swapVolumeByDay: SeriesPoint[];
    bridgeVolumeByDay: SeriesPoint[];
    xchangeBuyVolumeByDay: SeriesPoint[];
    xchangeSellVolumeByDay: SeriesPoint[];
    billsVolumeByDay: SeriesPoint[];
    activityBreakdown: Array<{
      day: string;
      swap: number;
      bridge: number;
      xchangeBuy: number;
      xchangeSell: number;
      bills: number;
    }>;
  };
  breakdowns: {
    categories: PieSlice[];
    statuses: PieSlice[];
    networks: PieSlice[];
    walletSources: PieSlice[];
    xchangeModes: PieSlice[];
  };
  recentTransactions: RecentTransaction[];
  downloads: {
    latestBySource: Array<{
      source: string;
      downloadCount: number;
      deltaCount: number | null;
      appUrl: string | null;
      recordedAt: string;
    }>;
    history: Array<{
      source: string;
      downloadCount: number;
      deltaCount: number | null;
      recordedAt: string;
      appUrl: string | null;
    }>;
  };
};

const apiUrl = () => (import.meta.env.VITE_ANALYTICS_API_URL || '').replace(/\/+$/, '');
const apiSecret = () => import.meta.env.VITE_ANALYTICS_DASHBOARD_SECRET || '';

const authHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-doxa-analytics-secret': apiSecret(),
});

const toErrorMessage = (payload: unknown, status: number) => {
  if (!payload || typeof payload !== 'object') {
    return `Request failed (${status})`;
  }

  const record = payload as Record<string, unknown>;
  const nestedError = record.error;

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }

  if (typeof nestedError === 'string' && nestedError.trim()) {
    return nestedError;
  }

  if (nestedError && typeof nestedError === 'object') {
    const nested = nestedError as Record<string, unknown>;
    if (typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message;
    }
    if (typeof nested.code === 'string' && nested.code.trim()) {
      return nested.code.replace(/_/g, ' ');
    }
  }

  if (typeof record.code === 'string' && record.code.trim()) {
    return record.code.replace(/_/g, ' ');
  }

  return `Request failed (${status})`;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiUrl();
  if (!base) {
    throw new Error('Set VITE_ANALYTICS_API_URL in analytics-dashboard/.env');
  }
  if (!apiSecret()) {
    throw new Error('Set VITE_ANALYTICS_DASHBOARD_SECRET in analytics-dashboard/.env');
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  }).catch(() => {
    throw new Error(
      'Could not reach the analytics API. Check CORS on the backend and that VITE_ANALYTICS_API_URL is correct.',
    );
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, response.status));
  }

  if (!payload?.data) {
    throw new Error('Analytics API returned an empty dashboard payload.');
  }

  return payload.data as T;
}

export const fetchDashboard = (days: number) =>
  request<DashboardSummary>(`/dashboard?days=${days}`);

export const syncUptodownDownloads = (appUrl?: string) =>
  request<unknown>('/downloads/sync-uptodown', {
    method: 'POST',
    body: JSON.stringify(appUrl ? { appUrl } : {}),
  });

export const recordDownloadCount = (downloadCount: number, source = 'uptodown') =>
  request<unknown>('/downloads', {
    method: 'POST',
    body: JSON.stringify({ source, downloadCount }),
  });
