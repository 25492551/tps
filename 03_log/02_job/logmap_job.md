# Job log map

**Purpose**: Index of completed jobs under `03_log/02_job/`. Newest first.

## Update Record

| When (UTC) | File | Summary |
|------------|------|---------|
| 2026-08-17T144132 | `2026-08-17T144132_partner_bank_min4_guard.md` | S01 bank digit≥4 before TPS sync; remove debug instrumentation |
| 2026-08-17T143340 | `2026-08-17T143340_s01_partner_api.md` | Partner API v1 + S01 handoff/virtual transfer game credit |
| 2026-08-17T141444 | `2026-08-17T141444_ledger_first_onchain_offramp.md` | Ledger-first; on-chain only sell sweep + external withdraw; hide user addresses |
| 2026-08-17T082349 | `2026-08-17T082349_otc_onchain_settle.md` | OTC buy/sell settle on-chain to/from user wallet; drop USDT ledger |
| 2026-08-17T081507 | `2026-08-17T081507_fix_buyer_phantom_usdt.md` | Remove buyer demo +5 USDT; clarify on-chain vs ledger |
| 2026-08-17T081124 | `2026-08-17T081124_admin_holds_request_time.md` | /admin/holds: show request time (KST) |
| 2026-08-17T080440 | `2026-08-17T080440_wallet_balance_section.md` | Wallet pages: on-chain USDT balance section |
| 2026-08-17T074551 | `2026-08-17T074551_replace_keyless_wallets.md` | Remove keyless wallets; new keyed custody default |
| 2026-08-12T044654 | `2026-08-12T044654_admin_custody_wallets.md` | Admin 테더지갑: create/register/transfer |
| 2026-08-11T144135 | `2026-08-11T144135_format_num_2dp.md` | Site-wide numeric display: 2 decimal places |
| 2026-08-11T143836 | `2026-08-11T143836_fx_refresh_interval.md` | Rates: refresh interval picker; drop 다시 선택 |
| 2026-08-11T143453 | `2026-08-11T143453_split_buy_sell_fx_fees.md` | Separate OTC buy/sell fee percents on /admin/rates |
| 2026-08-11T142944 | `2026-08-11T142944_create_modal_close_only.md` | Create-user modal: 닫기 only (no Esc/backdrop) |
| 2026-08-11T142906 | `2026-08-11T142906_approve_wallet_reject_suspend_rules.md` | Approve issues wallet; reject/suspend gated by status |
| 2026-08-11T142531 | `2026-08-11T142531_admin_users_create_modal.md` | /admin/users: 회원 추가 → top-right modal |
| 2026-08-11T142355 | `2026-08-11T142355_hide_approve_for_active_users.md` | Hide 승인 on /admin/users when already active |
| 2026-08-11T142215 | `2026-08-11T142215_fix_admin_users_td_flex.md` | Fix users table row borders (no flex on td) |
| 2026-08-11T142055 | `2026-08-11T142055_fix_wallet_key_reveal_secret.md` | Align WALLET_KEY_SECRET so admin key reveal decrypts |
| 2026-08-11T141824 | `2026-08-11T141824_admin_users_actions_nowrap.md` | Admin users/holds action cells nowrap |
| 2026-08-11T112714 | `2026-08-11T112714_fx_fee_percent.md` | Admin rates: OTC fee percent |
| 2026-08-11T103807 | `2026-08-11T103807_admin_otc_retire_boards.md` | Admin OTC; retire P2P boards |
| 2026-08-11T062205 | `2026-08-11T062205_default_managed_wallet_on_signup.md` | Signup creates admin-managed default TRC-20 wallet |
| 2026-08-11T061635 | `2026-08-11T061635_separate_admin_user_sessions.md` | Separate admin/user tokens + WS paths |
| 2026-08-11T061200 | `2026-08-11T061200_board_browse_by_counterpart_perm.md` | Buy/sell board browse gated; 내 거래 for own posts |
| 2026-08-11T055758 | `2026-08-11T055758_user_buy_sell_permissions.md` | Per-user buy/sell tether permission toggles |
| 2026-08-11T055452 | `2026-08-11T055452_admin_fx_rate_providers.md` | Admin FX rates page with multi-provider live quotes |
| 2026-08-11T053446 | `2026-08-11T053446_admin_site_settings_multi_login.md` | Admin site settings: multi-account browser login toggle |
| 2026-08-11T051644 | `2026-08-11T051644_postgres_bind_localhost.md` | tps-pg 5432 bound to 127.0.0.1 only |
| 2026-08-11T030350 | `2026-08-11T030350_bgp001_https_live.md` | bgp-001.com HTTPS live after DNS; D6 closed |
| 2026-08-11T030200 | `2026-08-11T030200_bgp001_host_routing.md` | bgp-001.com → TPS:3002 beside S01; DNS pending |
| 2026-08-11T025150 | `2026-08-11T025150_mvp_tether_market_implement.md` | MVP Phases 0–7: API/web, custody exchange, WS chat |
| 2026-08-11T024318 | `2026-08-11T024318_decide_chat_websocket.md` | Trade chat = WebSocket (D5); Phase 0 pending clear |
| 2026-08-11T024244 | `2026-08-11T024244_decide_public_signup_admin_approve.md` | Public signup; trade after admin approve (D4) |
| 2026-08-11T024120 | `2026-08-11T024120_decide_trc20_only.md` | USDT network locked to TRC-20 only (D3) |
| 2026-08-11T022632 | `2026-08-11T022632_decide_admin_custody_exchange.md` | Settlement = dual deposit to admin → approve → exchange |
| 2026-08-11T022253 | `2026-08-11T022253_plan_p2p_north_star.md` | Plan/pending aligned to user↔user USDT-KRW P2P |
| 2026-08-11T021911 | `2026-08-11T021911_tether_market_site_build_plan.md` | Tether Market site-build plan + pending Phase 0 decisions |
| 2026-08-10T081812 | `2026-08-10T081812_scaffold_from_s01.md` | Initial TPS scaffold (S01-style layout) |
