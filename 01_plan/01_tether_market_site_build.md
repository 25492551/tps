# Tether Market — Site Build Plan

**Status**: MVP implemented (2026-08-11) — living reference; archive when superseded  

**Source brief**: [`02_layout/tether.md`](../02_layout/tether.md)  
**Stack (as-built scaffold)**: API Express/TS · Web React/Vite · Postgres · npm workspace `05_data/`  
**Created**: 2026-08-11T021911 UTC  
**Updated**: 2026-08-11T024318 UTC — chat transport = WebSocket; Phase 0 decisions complete

---

## 1. Product north star

**유저 간** USDT(테더)와 원화(KRW) 거래를 중개·지원하는 사이트.  
매칭·채팅 후, **구매자·판매자 모두 관리자 계좌에 입금**(구매자→관리자 원화 통장, 판매자→관리자 테더 지갑)하고, 관리자가 **양쪽 입금을 확인·승인**하면 홀딩 중이던 **USDT와 KRW를 교환**해 각 유저에게 지급한다.  
플랫폼은 마켓메이커/자체 재고 판매가 아니라 **커스터디 에스크로** 역할이다.

| Actor | Goal |
|-------|------|
| Buyer | 관리자 원화 계좌에 KRW 입금 → 승인 후 USDT 수령 |
| Seller | 관리자 테더 지갑에 USDT 입금 → 승인 후 KRW 수령 |
| Admin | 입금 확인·승인, 홀드 자산 교환 실행, 회원·게시판·트랜잭션 감독 |

---

## 2. Scope from brief → delivery slices

### Admin portal
| Feature | Delivery meaning |
|---------|------------------|
| 게시판 관리 | 구매/판매 게시글 노출·숨김·삭제, 신고/분쟁 플래그 |
| 유저 관리 | 공개 가입 승인·거절, 회원 추가·삭제·수정·정지, 역할/상태 |
| 유저 머니 트랜잭션 조회 | 유저별 KRW/USDT ledger·홀드 타임라인 |

### User portal
| Feature | Delivery meaning |
|---------|------------------|
| 테더지갑 | 생성·등록·조회·이체(출금 요청) |
| 테더 구매 게시판 | Buy listings (KRW로 USDT 사려는 유저) |
| 테더 판매 게시판 | Sell listings (USDT를 팔려는 유저) |
| 채팅 UI | **거래 당사자 간** 1:1 메시지 |
| 거래 UI (관리자 머니 홀드) | 매칭 → 양쪽이 관리자 계좌 입금 → 관리자 양측 승인 → **홀드분 USDT↔KRW 교환** |

---

## 3. Target IA (to land in `02_layout/03_as_built_ia.md`)

### Routes (proposed)

| Path | Role | Notes |
|------|------|-------|
| `/` | Public landing / login redirect | Brand + CTA only |
| `/login`, `/register` | Auth | public self-register → `pending_approval` |
| `/app` | User shell | |
| `/app/wallets` | 테더지갑 | list / register / detail / transfer |
| `/app/buy` | 구매 게시판 | list + create + detail |
| `/app/sell` | 판매 게시판 | list + create + detail |
| `/app/trades/:id` | 거래 UI | P2P status + hold indicators |
| `/app/trades/:id/chat` | 채팅 | counterparty thread |
| `/app/transactions` | 내 머니 내역 | |
| `/admin` | Admin shell | role-gated |
| `/admin/users` | 유저 관리 | |
| `/admin/boards` | 게시판 관리 | buy/sell tabs |
| `/admin/transactions` | 전체 트랜잭션 | |
| `/admin/holds` | 홀드/에스크로 큐 | ops / dispute |

Web layout: `04_script/apps/web/src/portals/{user,admin}/`.

---

## 4. Domain model (first schema cut)

Core tables (migration series under `04_script/db/`):

1. **users** — id, email/phone, password hash, role (`user`|`admin`), status (`pending_approval`|`active`|`suspended`|`deleted`|`rejected`), timestamps UTC  
   - Self-register → `pending_approval`. **Trade gates** (create/accept listing, start trade) require `active`. Login OK while pending (read-only / wait UI).
2. **bank_accounts** — user_id **or** platform/admin custody flag, bank_name, account_no (masked), holder_name, verified_at  
3. **tether_wallets** — user_id **or** admin custody wallet, chain=`TRC-20` (only), address, label, status  
4. **custody_accounts** (or flags on 2/3) — admin KRW bank + admin USDT wallet shown to users per trade  
5. **listings** — type (`buy`|`sell`), **owner_user_id**, price_krw_per_usdt, amount_usdt, min/max, status (`open`|`matched`|`closed`|`hidden`)  
6. **trades** — listing_id, **buyer_user_id**, **seller_user_id**, amount_usdt, amount_krw, status (see §5)  
7. **deposit_intents** — trade_id, side (`buyer_krw`|`seller_usdt`), expected_amount, tx_ref/proof, status (`awaiting`|`received`|`rejected`)  
8. **holds** — trade_id, asset (`krw`|`usdt`), amount, depositor_user_id, status (`held`|`exchanged`|`refunded`|`cancelled`), admin_note  
9. **ledger_entries** — user_id, asset, direction, amount, ref_type/ref_id, balance_after, created_at  
10. **chat_threads** / **chat_messages** — trade_id scoped (buyer ↔ seller; admin read on dispute)  
11. **admin_audit_logs** — actor, action, payload

Money rules (system UTC `timestamptz`; UI KST display):

- Buyer deposits **KRW to admin bank**; seller deposits **USDT to admin wallet**.  
- Admin marks each side received → both enter **hold**.  
- On dual approval: **atomic exchange** — credit buyer USDT + credit seller KRW (and clear holds). Partial deposit = no exchange; refund/cancel paths for dispute.  
- Not market-making: admin custody is temporary escrow, not inventory sales.

**Decided (D1+D2)**: Admin-only confirmation of both deposits; then exchange held USDT↔KRW.  
**Decided (D3)**: USDT network = **TRC-20 only** (address validation / display; no multi-chain).  
**Decided (D4)**: **Public self-registration**; trading only after **admin approval** (`pending_approval` → `active`).  
**Decided (D5)**: Trade chat over **WebSocket** (not polling/SSE).

---

## 5. Trade state machine (MVP, admin custody exchange)

```
open_listing
  → trade_created                 # counterparty starts trade
  → awaiting_dual_deposit         # show admin KRW account + admin USDT wallet
  → krw_deposit_confirmed         # admin OK on buyer KRW (order flexible)
  → usdt_deposit_confirmed        # admin OK on seller USDT
  → both_held                     # admin holding both assets
  → exchange_executed             # admin approves swap → buyer gets USDT, seller gets KRW
  → completed
```

Either deposit leg can confirm first; **exchange only when both confirmed**.  
Cancel/dispute: `cancelled`, `disputed` → admin refund held leg(s) to original depositor.

No on-chain automation in MVP. Platform does **not** sell its own USDT stock.

---

## 6. Phased build (recommended order)

### Phase 0 — Product lock (docs only)
- Fill north star in `.cursorrules` / `README.md` from this plan (P2P wording).  
- Expand `dictionary.md` (P2P trade, listing, hold, ledger, wallet, counterparty).  
- Draft IA into `02_layout/03_as_built_ia.md`.  
- Phase 0 operator decisions D1–D5 are locked (see Pending resolved table / this §4).

### Phase 1 — Foundation
- Auth, role middleware, password hashing.  
- Public `POST /api/auth/register` → user `pending_approval`.  
- DB migrations for users + audit.  
- Web shells: user + admin layouts, nav, auth gates; pending users see “승인 대기” (no trade CTAs).  
- Seed: 1 admin, ≥2 **active** demo users (so P2P can be demoed).

**Exit**: public register + login; pending cannot hit trade APIs; `/admin` blocked for non-admin; `/api/me` returns status.

### Phase 2 — Admin: users + transactions (read path)
- Admin approve/reject queue for `pending_approval`; CRUD + suspend.  
- Ledger + transaction lookup (filter by user/date/asset).  
- Optional admin ledger adjust for ops corrections.

**Exit**: admin approves a self-registered user → that user can trade; money history works.

### Phase 3 — Wallets + bank registration
- Each user: Korean bank account + tether wallet address.  
- Admin: verify/flag.  
- Transfer = withdrawal request queue (MVP: ops off-platform; ledger intent).

**Exit**: both sides of a trade can show bank + wallet; trade gated on active wallet/bank as needed.

### Phase 4 — Boards (buy / sell)
- Listing CRUD; list/detail/search by other users’ posts.  
- Admin moderate (hide/delete).  
- “거래 시작” CTA stub until Phase 5.

**Exit**: buy/sell boards show peer listings; admin can moderate.

### Phase 5 — Trade UI + admin custody hold / exchange
- Create trade; UI shows **admin KRW bank** + **admin USDT wallet** deposit instructions.  
- Admin queue: confirm buyer KRW deposit, confirm seller USDT deposit, then **execute exchange** (or refund).  
- User trade detail: per-leg deposit status + final exchange result.  
- Ledger: deposit into custody hold → exchange credits to counterparties.

**Exit**: two demo users both deposit to admin → admin dual-approve → USDT↔KRW exchanged.

### Phase 6 — Chat (WebSocket)
- Trade-scoped buyer↔seller thread over **WebSocket** (auth’d connection; room = trade_id).  
- REST for history load (`GET` messages); live send/receive via WS.  
- Text only in MVP; admin can read on dispute.

**Exit**: counterparties exchange live messages inside an active trade.

### Phase 7 — Hardening & ops
- Rate limits, validation, audit coverage.  
- Korean manuals under `07_manual/`.  
- Tests for ledger/hold invariants (no double-release).  
- As-built IA sync; archive this plan when MVP ships.

---

## 7. API surface (MVP sketch)

| Area | Endpoints (illustrative) |
|------|---------------------------|
| Auth | `POST /api/auth/login`, `register`, `logout`; `GET /api/me` |
| Admin users | `GET/POST/PATCH /api/admin/users`; `POST .../approve\|reject\|suspend` |
| Wallets | `GET/POST /api/wallets`, transfer request |
| Banks | `GET/POST /api/bank-accounts` |
| Listings | `GET/POST /api/listings`, `PATCH` own; admin moderate |
| Trades | `POST /api/trades`, `GET /api/trades/:id` |
| Deposits | `POST /api/admin/trades/:id/deposits/{krw\|usdt}/confirm` |
| Exchange | `POST /api/admin/trades/:id/exchange` (requires both held); refund/cancel |
| Ledger | `GET /api/transactions` (self), admin all |
| Chat | `GET /api/trades/:id/messages` (history); `WS /api/ws` trade rooms for live send/recv |

---

## 8. UI build notes (existing design rules)

- Landing: brand-first, one composition; no dashboard clutter in hero.  
- App shells: denser ops layouts OK; cards only for interactive containers.  
- Datetimes: API/DB UTC; web display `Asia/Seoul`.  
- User-visible copy: Korean UI + Korean manuals when behavior ships.

---

## 9. Out of scope (MVP)

- Platform acting as market-maker / own USDT inventory sales  
- Automated on-chain USDT send / blockchain indexer  
- Non-TRC-20 USDT networks (ERC-20, etc.)  
- Full KYC vendor integration (beyond status flags)  
- Multi-currency beyond KRW/USDT  
- Mobile native apps  
- Real-time order book / matching engine  

---

## 10. Success criteria (MVP done)

1. Admin manages users and boards; inspects all money txs.  
2. Self-register → admin approve → two active users can post/accept buy or sell and open a trade.  
3. Dual deposit to admin accounts → admin confirms both → exchange completes end-to-end.  
4. Trade chat works between counterparties.  
5. `dictionary.md` + `03_as_built_ia.md` match shipped UI (P2P wording).  
6. Job logs + Korean manuals updated for operator-visible flows.

---

## 11. Suggested next implementation commit sequence

1. Phase 0 docs lock (dictionary, IA, north star — P2P)  
2. Phase 1 auth + shells  
3. Phase 2 admin users + ledger read  
4. Phase 3 wallets/banks  
5. Phase 4 boards  
6. Phase 5 trades/holds (user↔user)  
7. Phase 6 chat  
8. Phase 7 harden + manuals  

Phase 0 decisions accepted — ready to start Phase 0 docs lock + Phase 1 implementation.
