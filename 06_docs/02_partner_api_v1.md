# Partner API (v1)

**Audience**: External solutions (S01, future partners) that consume TPS as the USDT ledger / transfer UI.

**Base URL**: `https://bgp-001.com`  
**Auth**: `X-Partner-Key: <private_key>` or `Authorization: Bearer <private_key>`  
Admin issues a public/private pair at `/admin/solution-keys` (both shown). Empty/revoked hash blocks Partner API.

## Endpoints

### `POST /api/partner/v1/members`
Upsert member. **Bank fields required.**

```json
{
  "externalUserId": "<uuid>",
  "loginId": "member01",
  "nickname": "닉네임",
  "phone": "010...",
  "bankName": "국민은행",
  "bankAccount": "1234567890",
  "bankHolder": "홍길동"
}
```

Creates/activates a TPS user + managed wallet + bank account. Returns `{ userId, externalUserId, balances }`.

### `POST /api/partner/v1/members/:externalUserId/bank`
Update bank snapshot.

### `GET /api/partner/v1/members/:externalUserId/balance`
USDT/KRW balances + `virtualDepositAddress`.

### `POST /api/partner/v1/handoff`
```json
{ "externalUserId": "<uuid>" }
```
Returns `{ redirectUrl, handoffToken, virtualDepositAddress, expiresInSec }`.  
Browser opens `redirectUrl` → `/handoff` exchanges token → `/app/transfer?partner=<code>`.

## Virtual deposit transfer

User POSTs `/api/transfers` with `toAddress` = partner `virtual_deposit_address`:
1. Debit TPS USDT ledger (`partner_credit_out`)
2. Callback partner `callback_base_url` + `callback_path` with secret header
3. On failure, refund USDT

Rate: `partners.usdt_to_game_rate` (default 1 → floor to 0.01 game units).

## Partner callback (S01)

`POST {callback}/api/integrations/tps/credit-game`  
Headers: `X-Tps-Callback-Secret` / `Authorization: Bearer`  
Body: `{ externalUserId, amountUsdt, gameAmount, idempotencyKey, partnerCode }`

## S01 env

```
TPS_API_BASE_URL=https://bgp-001.com
TPS_PARTNER_KEY=<private_key>
TPS_CALLBACK_SECRET=...
```

## TPS env

```
PUBLIC_WEB_BASE_URL=https://bgp-001.com
PARTNER_HANDOFF_SECRET=...  # optional; defaults to JWT_SECRET
```
