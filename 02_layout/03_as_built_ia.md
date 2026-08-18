# As-built IA — Tether Market

**Status**: Admin OTC (2026-08-11). P2P boards retired; counterparty is always admin.  
**Source**: [`tether.md`](tether.md).  
**Code layout**: `04_script/apps/web/src/portals/{user,admin}/`.

---

## Routes

| Path | Role | Notes |
|------|------|-------|
| `/` | Public | Landing / brand + CTA |
| `/login`, `/register` | Auth | Public self-register → `pending_approval` |
| `/app` | User shell | |
| `/app/wallets` | User | 잔고(USDT/KRW) + 외부 출금 (주소 비공개) |
| `/app/banks` | User | 원화 계좌 등록 |
| `/app/buy` | User | 테더 구매 — KRW 입금 후 장부 USDT |
| `/app/sell` | User | 테더→원화 환전 — 장부 홀드 + 온체인 스윕 + KRW |
| `/app/transfer` | User | 이메일=장부 / 외부 T주소=온체인 출금 |
| `/app/trades` | User | 내 OTC 주문 목록 |
| `/app/trades/:id` | User | 주문 상세 + 채팅 (지갑 주소 비공개) |
| `/app/transactions` | User | 거래 내역 (거래 ID 표시) |
| `/admin` | Admin shell | |
| `/admin/users` | Admin | 유저 관리 + 관리 지갑 키 |
| `/admin/wallets` | Admin | 커스터디 테더지갑 생성·등록·이전 |
| `/admin/holds` | Admin | OTC 입금 확인·지급 |
| `/admin/transactions` | Admin | 전체 트랜잭션 |
| `/admin/rates` | Admin | 환율 소스 + 업데이트 주기 + 구매/판매 수수료(%) |
| `/admin/settings` | Admin | 사이트 설정 |

**Gates**: `pending_approval` — no trade until `active`. `canBuyTether` / `canSellTether` gate buy/sell order create only.

---

## Menus

### User shell

| Item | Route |
|------|-------|
| 테더지갑 | `/app/wallets` |
| 테더 구매 | `/app/buy` (canBuy) |
| 테더 판매 | `/app/sell` (canSell) |
| 테더 전송 | `/app/transfer` |
| 내 거래 | `/app/trades` |
| 머니 내역 | `/app/transactions` |

### Admin shell

| Item | Route |
|------|-------|
| 유저 관리 | `/admin/users` |
| 테더지갑 | `/admin/wallets` |
| OTC 입금·지급 | `/admin/holds` |
| 트랜잭션 | `/admin/transactions` |
| 환율 | `/admin/rates` |
| 사이트 설정 | `/admin/settings` |

---

## Public / auth

- Session split: user vs admin tokens (`tps_token_user` / `tps_token_admin`) and WS paths.
- Signup creates platform-managed default TRC-20 wallet (admin holds encrypted private key).
