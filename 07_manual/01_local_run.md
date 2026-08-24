# 로컬 실행 (Tether Market)

## 준비

1. PostgreSQL 실행 (예: Docker)
   ```bash
   docker run -d --name tps-pg \
     -e POSTGRES_USER=tps -e POSTGRES_PASSWORD=tps -e POSTGRES_DB=tps \
     -p 5432:5432 postgres:16-alpine
   ```
2. 저장소 루트 `.env.example` → `.env` 복사 후 `DATABASE_URL`, `JWT_SECRET` 설정
3. `cd 05_data && npm install`
4. 시드: 저장소 루트에서 `npm run seed`  
   (마이그레이션 `04_script/db/*.sql` 자동 적용)

## 개발 서버

저장소 루트에서:

```bash
npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173  ( /api 프록시 )
```

## 데모 로그인

- 관리자: `admin` / `admin123` → `/admin-login` (자동 접속 방지 문자) → `/admin`
- 유저(member): `buyer` 또는 `seller` / `demo1234` → `/app/wallets`
- 에이전트: 관리자 **유저 관리**에서 역할 `agent` + 솔루션 지정 후 해당 계정으로 로그인 → `/agent`
- 아이디는 이메일 형식이 아닌 일반 텍스트이며, **대소문자를 구분하지 않습니다**.

## 프로덕션 도메인 (GCE, S01과 동일 VM)

- 사이트: `https://bgp-001.com` (TPS, 컨테이너 포트 **3002**)
- 같은 Caddy의 S01: `https://bg-demo001.uk` (포트 **3001**) — 호스트/포트 분리
- 배포: [`04_script/deploy/gce/README.md`](../04_script/deploy/gce/README.md)
- Cloudflare A 레코드(DNS only)가 VM IP로 잡혀 있어야 HTTPS 인증서가 발급됩니다.

운영 절차는 [`02_tether_market_ops.md`](02_tether_market_ops.md) 참고.

## 폴더 역할

| 폴더 | 역할 |
|------|------|
| `01_plan/` | 향후 계획 |
| `02_layout/` | IA / 브랜드 |
| `03_log/` | 채팅·작업 로그 |
| `04_script/` | 코드 (`apps/`, `db/`) |
| `05_data/` | npm 워크스페이스 |
| `06_docs/` | 영문 엔지니어링 노트 |
| `07_manual/` | 운영 매뉴얼(한국어) |

시각: 시스템/로그 **UTC**, UI 표시 **KST**.
