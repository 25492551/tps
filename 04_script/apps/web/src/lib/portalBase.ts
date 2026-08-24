import { useLocation } from 'react-router-dom';

/** Member trading UI base: `/app` or `/agent` (agent reuses the same pages). */
export type PortalBase = '/app' | '/agent';

export function usePortalBase(): PortalBase {
  const { pathname } = useLocation();
  return pathname.startsWith('/agent') ? '/agent' : '/app';
}

/** Personal USDT ledger path (agent keeps `/agent/transactions` for solution txs). */
export function portalTransactionsPath(base: PortalBase): string {
  return base === '/agent' ? '/agent/my-transactions' : '/app/transactions';
}
