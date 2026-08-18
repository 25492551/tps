# Dictionary (vocabulary authority)

**Rule**: Prefer this file for product terms. Update here when naming changes; keep code / UI / manuals aligned.

---

## 1. Solution

- **Tether Market**: Users trade USDT ↔ KRW **with the admin (platform OTC)**. No P2P listing board.

## 2. Portals / roles

| Term | Meaning |
|------|---------|
| Buyer | User buying USDT from admin; pays KRW to admin bank; receives USDT on **internal ledger** (shown as normal balance; no address shown) |
| Seller | User converting USDT→KRW; ledger hold then admin settle: **on-chain custody hot→cold sweep** + KRW ledger credit |
| Admin | OTC counterparty; confirms KRW / sell settle; holds custody keys; may see addresses |

## 3. Money / status terms

| Term | Meaning |
|------|---------|
| OTC order | `buy_from_admin` (ledger USDT) or `sell_to_admin` (ledger hold + on-chain sweep + KRW) |
| Admin bank / custody wallet | KRW bank for buys; custody TRC-20 hot/cold for inventory (`/admin/wallets`) |
| Custody wallet transfer | Admin ops record for moving USDT between custody wallets |
| Hold | Ops/ledger hold while sell awaits admin settle |
| Ledger | Primary user balances; buy/internal transfer stay ledger-only |
| On-chain settle | **Sell**: custody hot → cold/sweep; **External withdraw**: custody → external address |
| Partner | External solution consuming TPS partner API (`partners.code`, e.g. `s01`) |
| Partner member | Mapped S01/external account → TPS `users` via `partner_members` |
| Handoff | Short-lived SSO token; `/handoff` → user JWT → transfer UI |
| Virtual deposit address | UI-only fake TRC-20 address; transfer debits USDT and credits partner game money |
| Partner credit | `partner_credit_out` ledger + partner callback (no on-chain) |
| TRC-20 | Sole supported USDT network (Tron) |
| pending_approval | Self-registered; cannot trade until admin sets `active` |
| active | Trading allowed (unless suspended) |
| Trade chat (WebSocket) | Messages scoped to an OTC trade between user and admin |
| Multi-account browser login | User-slot lock only; admin session separate |
| User session token | `tps_token_user` — `/app/*` + `/api/ws/user` |
| Admin session token | `tps_token_admin` — `/admin/*` + `/api/ws/admin` |
| FX rate provider | Source for KRW/USDT spot at OTC order create |
| FX buy fee percent | Fee % on user buy-from-admin: spot×(1+fee/100) |
| FX sell fee percent | Fee % on user sell-to-admin: spot×(1−fee/100) |
| FX refresh interval | How long selected provider spot is reused for OTC (`1h`/`6h`/`1d`/`3d`/`1w`) |
| Numeric display | UI amounts/rates shown with 2 decimal places (`formatNum`) |
| canBuyTether | May create buy-from-admin orders |
| canSellTether | May create sell-to-admin orders |
| 내 거래 | User’s OTC order list + detail/chat |
| 테더 전송 | Internal USDT ledger transfer to another platform user |
| 이체 | External TRC-20 withdrawal request from managed wallet UI |

## 4. Accounts & assets

| Term | Meaning |
|------|---------|
| Bank account | User’s Korean bank account for KRW receipt |
| Platform-managed wallet | Default TRC-20 wallet issued on **admin approve** (or admin create); admin holds encrypted private key; user sees address only |
| Withdrawal request | Off-platform USDT payout intent (ops queue) |

## 5. Marketplace & trades

| Term | Meaning |
|------|---------|
| Listing | **Retired** (legacy table may remain; user boards removed) |
| Trade / order | OTC deal with admin as buyer or seller |
| Counterparty | Always admin for new orders |

---

*(Expand sections as the product grows. Keep English section titles; Korean glosses OK in body.)*
