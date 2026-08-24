# As-built IA — Tether Market

**Status**: Admin OTC (2026-08-11). P2P boards retired; counterparty is always admin.  
**Source**: [`tether.md`](tether.md).  
**Code layout**: `04_script/apps/web/src/portals/{user,admin,agent}/`.  
**Portal chrome**: top header (brand + stats) + left nav sidebar + main (`ShellLayout`). UI body = Inter; brand/numbers = Noto Serif KR; achromatic dark.

---

## Routes

| Path | Role | Notes |
|------|------|-------|
| `/` | Public | Landing / brand + CTA |
| `/login`, `/register` | Auth | Member/agent login; register closed |
| `/admin-login` | Auth | Admin login + captcha on the same form |
| `/login/captcha` | Auth | Redirect → `/admin-login` |
| `/app` | Member shell | Redirect → `/app/wallets` |
| `/app/wallets` | User | USDT 잔고 (기본 탭; 외부 출금은 `/app/transfer`) |
| `/app/me` | User | 내 정보 · 원화 계좌 등록 요청·소프트 삭제 |
| `/app/banks` | User | Redirect → `/app/me` |
| `/app/buy` | User | 관리자 판매 OTC; permission off → ask admin |
| `/app/sell` | User | 테더→원화 환전 — 장부 홀드 + 온체인 스윕; KRW 오프라인 지급 |
| `/app/transfer` | User | 아이디=장부 / 외부 T주소=온체인 출금 |
| `/app/trades` | User | 내 OTC 주문 목록 (유형·상태 필터; ID 비링크) |
| `/app/trades/:id` | User | 주문 상세 (입금 안내 · 채팅 없음) |
| `/app/transactions` | User | 거래 내역 (거래 ID 표시) |
| `/agent` | Agent shell | 본인 거래 탭 + 솔루션 관리 (탭 제목 TPS-agent) |
| `/agent/wallets` … `/agent/trades/:id` | Agent | Same trading pages as `/app/*` |
| `/agent/my-transactions` | Agent | Own USDT ledger (거래 내역) |
| `/agent/transactions` | Agent | 담당 솔루션 USDT 원장 |
| `/agent/members` | Agent | 담당 솔루션 회원 목록 · 아이디 클릭 → 회원정보 새창 |
| `/agent/member/:loginId` | Agent | 회원정보 팝업(기본정보·머니트랜잭션·접속기록) |
| `/agent/settlements` | Agent | 미정산·정산 이력 (받을 KRW) |
| `/admin` | Admin shell | |
| `/admin/users` | Admin | 유저 관리 + 관리 지갑 키 · 아이디 클릭 → 회원정보 새창 |
| `/admin/member/:loginId` | Admin | 회원정보 팝업(기본정보·머니트랜잭션·접속기록) · 기본/원화계좌 수정 |
| `/admin/bank-requests` | Admin | 계좌 변경 승인 |
| `/admin/wallets` | Admin | 커스터디 테더지갑 생성·등록·이전 |
| `/admin/holds` | Admin | OTC 입금 확인·지급 |
| `/admin/transactions` | Admin | 전체 트랜잭션 |
| `/admin/agent-fees` | Admin | 솔루션별 에이전트 수수료 % |
| `/admin/agent-tree` | Admin | 에이전트(솔루션) 상부·하부 트리 |
| `/admin/agent-stats` | Admin | 에이전트별 수수료·관리자 몫 통계 |
| `/admin/agent-settlements` | Admin | 기간별 에이전트 정산 완료 |
| `/admin/rates` | Admin | 환율 소스 + 업데이트 주기 + 구매/판매 수수료(%) |
| `/admin/api-guide` | Admin | 파트너(솔루션) API 연동 안내 (한국어) |
| `/admin/solution-keys` | Admin | 솔루션별 Partner API 키 등록·발급·회수 |
| `/admin/settings` | Admin | 사이트 설정 (중복 로그인 · OTC 알림음) |

**Gates**: `pending_approval` — no trade until `active`. `canBuyTether` / `canSellTether` gate buy/sell order create only (tabs always visible).

**Tables**: Admin / agent / member list pages use a second header row of per-column filters (`ColumnFilterRow`). Text columns search by substring; select columns match exactly. Combined AND. URL `loginId` still seeds the 아이디 column on transaction pages.

---

## Menus

### User shell

| Item | Route |
|------|-------|
| 테더지갑 | `/app/wallets` |
| 테더 구매 | `/app/buy` |
| 테더 판매 | `/app/sell` |
| 테더 전송 | `/app/transfer` |
| 내 거래 | `/app/trades` |
| 거래 내역 | `/app/transactions` |
| 내 정보 | `/app/me` |

### Admin shell

| Item | Route |
|------|-------|
| 유저 관리 | `/admin/users` |
| 계좌 변경 승인 | `/admin/bank-requests` |
| 테더지갑 | `/admin/wallets` |
| OTC 입금·지급 | `/admin/holds` |
| 트랜잭션 | `/admin/transactions` |
| **에이전트 관리** (그룹) | 수수료 · 트리 · 통계 · 정산 |
| → 수수료 | `/admin/agent-fees` |
| → 트리 | `/admin/agent-tree` |
| → 통계 | `/admin/agent-stats` |
| → 정산 | `/admin/agent-settlements` |
| 환율 | `/admin/rates` |
| API 안내 | `/admin/api-guide` |
| API 키 관리 | `/admin/solution-keys` |
| 사이트 설정 | `/admin/settings` |

### Agent shell

| Item | Route |
|------|-------|
| 홈 | `/agent` |
| **개인 거래** (그룹) | 테더지갑 · 내 정보 · 구매 · 판매 · 전송 · 내 거래 · 거래 내역 |
| → 테더지갑 | `/agent/wallets` |
| → 내 정보 | `/agent/me` |
| → 테더 구매 | `/agent/buy` |
| → 테더 판매 | `/agent/sell` |
| → 테더 전송 | `/agent/transfer` |
| → 내 거래 | `/agent/trades` |
| → 거래 내역 | `/agent/my-transactions` |
| **솔루션 관리** (그룹) | 솔루션 트랜잭션 · 회원 · 정산 |
| → 솔루션 트랜잭션 | `/agent/transactions` |
| → 회원 | `/agent/members` |
| → 정산 | `/agent/settlements` |

---

## Public / auth

- Session split: user vs admin tokens (`tps_token_user` / `tps_token_admin`) and WS paths.
- Signup creates platform-managed default TRC-20 wallet (admin holds encrypted private key).
