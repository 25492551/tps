# Top bar USDT KRW estimate

## Summary

Admin, agent, and member top bars show held USDT with a parenthetical whole-won KRW estimate using the sell-side spot rate (`floor(USDT × rate)`).

## Changes

- `04_script/apps/web/src/lib/api.ts` — `estimateUsdtKrw`
- `04_script/apps/web/src/portals/{admin,agent,user}/*Shell.tsx` — display + rate poll
