export type RateProviderId =
  | 'upbit'
  | 'bithumb'
  | 'coingecko'
  | 'coinpaprika'
  | 'binance_usdt_usd';

export type RateProviderMeta = {
  id: RateProviderId;
  name: string;
  siteUrl: string;
  description: string;
  pair: string;
};

export type RateQuote = {
  providerId: RateProviderId;
  rateKrwPerUsdt: number | null;
  fetchedAt: string;
  error?: string;
  rawNote?: string;
};

export const RATE_PROVIDERS: RateProviderMeta[] = [
  {
    id: 'upbit',
    name: '업비트 (Upbit)',
    siteUrl: 'https://upbit.com',
    description: '업비트 공개 API — KRW-USDT 체결가',
    pair: 'KRW/USDT',
  },
  {
    id: 'bithumb',
    name: '빗썸 (Bithumb)',
    siteUrl: 'https://www.bithumb.com',
    description: '빗썸 공개 API — USDT_KRW 종가',
    pair: 'KRW/USDT',
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    siteUrl: 'https://www.coingecko.com',
    description: 'CoinGecko simple/price — Tether → KRW',
    pair: 'KRW/USDT',
  },
  {
    id: 'coinpaprika',
    name: 'CoinPaprika',
    siteUrl: 'https://coinpaprika.com',
    description: 'CoinPaprika tickers — USDT/KRW',
    pair: 'KRW/USDT',
  },
  {
    id: 'binance_usdt_usd',
    name: 'Binance + 원달러',
    siteUrl: 'https://www.binance.com',
    description: 'USDT≈USD(1) × 공개 USD/KRW (Frankfurter ECB) 근사',
    pair: 'KRW/USDT (approx)',
  },
];

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'tps-market/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchUpbit(): Promise<number> {
  const data = (await fetchJson(
    'https://api.upbit.com/v1/ticker?markets=KRW-USDT',
  )) as Array<{ trade_price?: number }>;
  const price = Number(data?.[0]?.trade_price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid Upbit price');
  return price;
}

async function fetchBithumb(): Promise<number> {
  const data = (await fetchJson(
    'https://api.bithumb.com/public/ticker/USDT_KRW',
  )) as { status?: string; data?: { closing_price?: string } };
  if (data.status !== '0000') throw new Error(`Bithumb status ${data.status}`);
  const price = Number(data.data?.closing_price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid Bithumb price');
  return price;
}

async function fetchCoinGecko(): Promise<number> {
  const data = (await fetchJson(
    'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw',
  )) as { tether?: { krw?: number } };
  const price = Number(data.tether?.krw);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid CoinGecko price');
  return price;
}

async function fetchCoinPaprika(): Promise<number> {
  const data = (await fetchJson(
    'https://api.coinpaprika.com/v1/tickers/usdt-tether?quotes=KRW',
  )) as { quotes?: { KRW?: { price?: number } } };
  const price = Number(data.quotes?.KRW?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid CoinPaprika price');
  return price;
}

async function fetchBinanceApprox(): Promise<{ price: number; note: string }> {
  // USDT pegged ~1 USD; Frankfurter (ECB) USD→KRW
  const fx = (await fetchJson('https://api.frankfurter.app/latest?from=USD&to=KRW')) as {
    rates?: { KRW?: number };
  };
  const krw = Number(fx.rates?.KRW);
  if (!Number.isFinite(krw) || krw <= 0) throw new Error('Invalid Frankfurter USD/KRW');
  return {
    price: krw,
    note: `USDT≈1 USD × ${krw.toFixed(2)} KRW/USD (ECB via Frankfurter)`,
  };
}

export async function fetchProviderRate(id: RateProviderId): Promise<RateQuote> {
  const fetchedAt = new Date().toISOString();
  try {
    if (id === 'upbit') {
      return { providerId: id, rateKrwPerUsdt: await fetchUpbit(), fetchedAt };
    }
    if (id === 'bithumb') {
      return { providerId: id, rateKrwPerUsdt: await fetchBithumb(), fetchedAt };
    }
    if (id === 'coingecko') {
      return { providerId: id, rateKrwPerUsdt: await fetchCoinGecko(), fetchedAt };
    }
    if (id === 'coinpaprika') {
      return { providerId: id, rateKrwPerUsdt: await fetchCoinPaprika(), fetchedAt };
    }
    if (id === 'binance_usdt_usd') {
      const r = await fetchBinanceApprox();
      return {
        providerId: id,
        rateKrwPerUsdt: r.price,
        fetchedAt,
        rawNote: r.note,
      };
    }
    throw new Error('Unknown provider');
  } catch (e) {
    return {
      providerId: id,
      rateKrwPerUsdt: null,
      fetchedAt,
      error: e instanceof Error ? e.message : 'Fetch failed',
    };
  }
}

export async function fetchAllProviderRates(): Promise<RateQuote[]> {
  return Promise.all(RATE_PROVIDERS.map((p) => fetchProviderRate(p.id)));
}

export function isRateProviderId(v: string): v is RateProviderId {
  return RATE_PROVIDERS.some((p) => p.id === v);
}

export type FxRefreshIntervalId = '1h' | '6h' | '1d' | '3d' | '1w';

export const FX_REFRESH_INTERVALS: ReadonlyArray<{
  id: FxRefreshIntervalId;
  labelKo: string;
  seconds: number;
}> = [
  { id: '1h', labelKo: '1시간', seconds: 3600 },
  { id: '6h', labelKo: '6시간', seconds: 6 * 3600 },
  { id: '1d', labelKo: '1일', seconds: 24 * 3600 },
  { id: '3d', labelKo: '3일', seconds: 3 * 24 * 3600 },
  { id: '1w', labelKo: '1주', seconds: 7 * 24 * 3600 },
];

export function isFxRefreshIntervalId(v: string): v is FxRefreshIntervalId {
  return FX_REFRESH_INTERVALS.some((i) => i.id === v);
}

export function refreshIntervalSeconds(id: FxRefreshIntervalId): number {
  return FX_REFRESH_INTERVALS.find((i) => i.id === id)?.seconds ?? 3600;
}

export type FxRateSnapshot = {
  providerId: RateProviderId;
  rateKrwPerUsdt: number;
  fetchedAt: string;
};
