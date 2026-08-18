import { query } from './db.js';
import {
  fetchProviderRate,
  isFxRefreshIntervalId,
  isRateProviderId,
  refreshIntervalSeconds,
  type FxRateSnapshot,
  type FxRefreshIntervalId,
  type RateProviderId,
  type RateQuote,
} from './rates.js';

const KEY_MULTI = 'allow_multi_account_browser';
const KEY_FX = 'fx_rate_provider';
/** @deprecated Prefer buy/sell keys; kept as read fallback. */
const KEY_FX_FEE = 'fx_fee_percent';
const KEY_FX_BUY_FEE = 'fx_buy_fee_percent';
const KEY_FX_SELL_FEE = 'fx_sell_fee_percent';
const KEY_FX_REFRESH = 'fx_rate_refresh_interval';
const KEY_FX_SNAPSHOT = 'fx_rate_snapshot';

export type SiteSettings = {
  allowMultiAccountBrowser: boolean;
  fxRateProvider: RateProviderId;
  /** Buy-from-admin fee % (spot × (1 + fee/100)). */
  fxBuyFeePercent: number;
  /** Sell-to-admin fee % (spot × (1 − fee/100)). */
  fxSellFeePercent: number;
  /** How long the selected provider spot is reused before re-fetch. */
  fxRateRefreshInterval: FxRefreshIntervalId;
  /** Last successful spot for OTC (selected provider). */
  fxRateSnapshot: FxRateSnapshot | null;
};

async function readJsonSetting(key: string): Promise<unknown> {
  const r = await query<{ value: unknown }>(
    `SELECT value FROM site_settings WHERE key = $1`,
    [key],
  );
  return r.rows[0]?.value;
}

async function writeJsonSetting(key: string, value: unknown) {
  await query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

function parseFeePercent(raw: unknown): number {
  let n = 0;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string') n = Number(raw.replace(/^"|"$/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 10000) / 10000;
}

function parseRefreshInterval(raw: unknown): FxRefreshIntervalId {
  const s = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : String(raw ?? '1h');
  return isFxRefreshIntervalId(s) ? s : '1h';
}

function parseSnapshot(raw: unknown): FxRateSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const providerId = typeof o.providerId === 'string' ? o.providerId : '';
  const rate = Number(o.rateKrwPerUsdt);
  const fetchedAt = typeof o.fetchedAt === 'string' ? o.fetchedAt : '';
  if (!isRateProviderId(providerId) || !(rate > 0) || !fetchedAt) return null;
  return { providerId, rateKrwPerUsdt: rate, fetchedAt };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const [multiRaw, fxRaw, buyFeeRaw, sellFeeRaw, legacyFeeRaw, refreshRaw, snapRaw] =
    await Promise.all([
      readJsonSetting(KEY_MULTI),
      readJsonSetting(KEY_FX),
      readJsonSetting(KEY_FX_BUY_FEE),
      readJsonSetting(KEY_FX_SELL_FEE),
      readJsonSetting(KEY_FX_FEE),
      readJsonSetting(KEY_FX_REFRESH),
      readJsonSetting(KEY_FX_SNAPSHOT),
    ]);

  let allowMultiAccountBrowser = true;
  if (typeof multiRaw === 'boolean') allowMultiAccountBrowser = multiRaw;
  else if (multiRaw != null) allowMultiAccountBrowser = String(multiRaw) === 'true';

  let fxRateProvider: RateProviderId = 'upbit';
  const fxStr = typeof fxRaw === 'string' ? fxRaw.replace(/^"|"$/g, '') : String(fxRaw ?? 'upbit');
  const candidate = typeof fxRaw === 'string' ? fxRaw : fxStr;
  if (isRateProviderId(candidate)) fxRateProvider = candidate;

  const legacy = parseFeePercent(legacyFeeRaw);
  return {
    allowMultiAccountBrowser,
    fxRateProvider,
    fxBuyFeePercent: buyFeeRaw != null ? parseFeePercent(buyFeeRaw) : legacy,
    fxSellFeePercent: sellFeeRaw != null ? parseFeePercent(sellFeeRaw) : legacy,
    fxRateRefreshInterval: parseRefreshInterval(refreshRaw),
    fxRateSnapshot: parseSnapshot(snapRaw),
  };
}

export async function setAllowMultiAccountBrowser(value: boolean) {
  await writeJsonSetting(KEY_MULTI, value);
  return getSiteSettings();
}

export async function setFxRateProvider(providerId: RateProviderId) {
  await writeJsonSetting(KEY_FX, providerId);
  return getSiteSettings();
}

export async function setFxFeePercents(buyPercent: number, sellPercent: number) {
  const buy = parseFeePercent(buyPercent);
  const sell = parseFeePercent(sellPercent);
  await writeJsonSetting(KEY_FX_BUY_FEE, buy);
  await writeJsonSetting(KEY_FX_SELL_FEE, sell);
  return getSiteSettings();
}

export async function setFxRateRefreshInterval(interval: FxRefreshIntervalId) {
  await writeJsonSetting(KEY_FX_REFRESH, interval);
  return getSiteSettings();
}

export async function setFxRateSnapshot(snapshot: FxRateSnapshot) {
  await writeJsonSetting(KEY_FX_SNAPSHOT, snapshot);
  return getSiteSettings();
}

export function feePercentForSide(settings: SiteSettings, side: 'buy' | 'sell'): number {
  return side === 'buy' ? settings.fxBuyFeePercent : settings.fxSellFeePercent;
}

/** Apply fee spread: buy pays more, sell receives less. */
export function applyFxFee(spotKrwPerUsdt: number, feePercent: number, side: 'buy' | 'sell'): number {
  const fee = parseFeePercent(feePercent);
  const mult = side === 'buy' ? 1 + fee / 100 : 1 - fee / 100;
  const rate = spotKrwPerUsdt * mult;
  if (!(rate > 0)) throw new Error('Effective rate must be positive (check fee %)');
  return Math.round(rate * 100) / 100;
}

function snapshotFresh(settings: SiteSettings): boolean {
  const snap = settings.fxRateSnapshot;
  if (!snap || snap.providerId !== settings.fxRateProvider) return false;
  const ageMs = Date.now() - new Date(snap.fetchedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return false;
  return ageMs < refreshIntervalSeconds(settings.fxRateRefreshInterval) * 1000;
}

/**
 * Spot for OTC: reuse DB snapshot within refresh interval; otherwise fetch and store.
 * Pass forceRefresh=true to always hit the provider (e.g. admin “현재가” on selected source).
 */
export async function getSiteSpotQuote(opts?: { forceRefresh?: boolean }): Promise<RateQuote> {
  const settings = await getSiteSettings();
  const providerId = settings.fxRateProvider;

  if (!opts?.forceRefresh && snapshotFresh(settings) && settings.fxRateSnapshot) {
    const snap = settings.fxRateSnapshot;
    return {
      providerId: snap.providerId,
      rateKrwPerUsdt: snap.rateKrwPerUsdt,
      fetchedAt: snap.fetchedAt,
      rawNote: 'cached',
    };
  }

  const quote = await fetchProviderRate(providerId);
  if (quote.rateKrwPerUsdt != null && quote.rateKrwPerUsdt > 0) {
    await setFxRateSnapshot({
      providerId,
      rateKrwPerUsdt: quote.rateKrwPerUsdt,
      fetchedAt: quote.fetchedAt,
    });
  }
  return quote;
}
