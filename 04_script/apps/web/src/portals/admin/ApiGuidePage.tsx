/** Admin-facing Korean guide for partner (solution) API integration. */

export function AdminApiGuidePage() {
  return (
    <div className="api-doc">
      <h1 className="page-title">API 안내</h1>
      <p className="page-sub">
        외부 솔루션(파트너)이 Tether Market(TPS)과 연동할 때 사용하는 Partner API 안내입니다. 운영자·솔루션
        개발자가 참고하세요.
      </p>

      <div className="panel stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          1. 개요
        </h2>
        <p className="setting-desc">
          TPS는 솔루션 회원의 <strong>USDT 장부</strong>와 OTC(관리자 매매)·전송 UI를 제공합니다. 솔루션은
          서버에서 Partner API로 회원을 동기화하고, 브라우저는 <strong>핸드오프</strong>로 TPS에 로그인합니다.
          공개 회원가입은 쓰지 않습니다.
        </p>
        <ul className="api-doc-list">
          <li>
            <strong>베이스 URL</strong>: <code>https://bgp-001.com</code>
          </li>
          <li>
            <strong>API 접두사</strong>: <code>/api/partner/v1</code>
          </li>
          <li>
            <strong>인증</strong>: 요청 헤더에 <strong>개인키</strong>
            <br />
            <code>X-Partner-Key: &lt;개인키&gt;</code> 또는{' '}
            <code>Authorization: Bearer &lt;개인키&gt;</code>
            <br />
            공개키·개인키는 관리자 <a href="/admin/solution-keys">API 키 관리</a> 탭에서 확인·발급·회수합니다.
          </li>
        </ul>
      </div>

      <div className="panel stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          2. 연동 흐름
        </h2>
        <ol className="api-doc-list">
          <li>
            솔루션에서 회원 가입·로그인 시 <code>POST /members</code>로 TPS 회원·원화 계좌를 upsert 합니다.
            (계좌번호는 <strong>숫자 4자리 이상</strong> 필수)
          </li>
          <li>
            「테더로 충전」 등에서 <code>POST /handoff</code>를 호출하고, 응답의{' '}
            <code>redirectUrl</code>로 사용자를 보냅니다.
          </li>
          <li>
            사용자는 TPS <code>/handoff</code> → 자동 로그인 →{' '}
            <code>/app/transfer?partner=코드</code> (게임 충전) 화면으로 이동합니다.
          </li>
          <li>
            사용자가 파트너 <strong>가상 입금 주소</strong>로 USDT를 보내면 TPS 장부에서 차감하고, 솔루션
            콜백으로 게임머니를 적립합니다. 콜백 실패 시 USDT는 환불됩니다.
          </li>
        </ol>
      </div>

      <div className="panel stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          3. API 엔드포인트
        </h2>

        <h3 className="api-doc-h3">POST /api/partner/v1/members</h3>
        <p className="setting-desc">회원 upsert. 통장 정보 필수(은행명·계좌·예금주). 활성 TPS 유저·관리 지갑·계좌를 생성/갱신합니다.</p>
        <pre className="api-doc-pre">{`{
  "externalUserId": "<솔루션 측 회원 UUID>",
  "loginId": "member01",
  "nickname": "닉네임",
  "phone": "010...",
  "bankName": "국민은행",
  "bankAccount": "1234567890",
  "bankHolder": "홍길동"
}`}</pre>
        <p className="setting-desc">
          응답 예: <code>{`{ userId, externalUserId, balances }`}</code>
        </p>

        <h3 className="api-doc-h3">POST /api/partner/v1/members/:externalUserId/bank</h3>
        <p className="setting-desc">등록 원화 계좌만 갱신합니다. 본문은 members와 동일한 은행 필드입니다.</p>

        <h3 className="api-doc-h3">GET /api/partner/v1/members/:externalUserId/balance</h3>
        <p className="setting-desc">
          USDT(및 관련) 잔고와 파트너 <code>virtualDepositAddress</code>를 반환합니다.
        </p>

        <h3 className="api-doc-h3">POST /api/partner/v1/handoff</h3>
        <pre className="api-doc-pre">{`{ "externalUserId": "<솔루션 측 회원 UUID>" }`}</pre>
        <p className="setting-desc">
          응답: <code>redirectUrl</code>, <code>handoffToken</code>, <code>virtualDepositAddress</code>,{' '}
          <code>expiresInSec</code>. 계좌가 없으면 핸드오프가 거부됩니다.
        </p>
      </div>

      <div className="panel stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          4. 가상 입금(게임 충전) 콜백
        </h2>
        <p className="setting-desc">
          회원이 TPS에서 파트너 가상 주소로 USDT를 전송하면, TPS가 솔루션에 콜백합니다.
        </p>
        <ul className="api-doc-list">
          <li>
            URL: <code>{`{callback_base_url}{callback_path}`}</code> (예: S01{' '}
            <code>/api/integrations/tps/credit-game</code>)
          </li>
          <li>
            헤더: <code>X-Tps-Callback-Secret</code> 또는 <code>Authorization: Bearer</code> (콜백
            시크릿)
          </li>
        </ul>
        <pre className="api-doc-pre">{`{
  "externalUserId": "<uuid>",
  "amountUsdt": 10.5,
  "gameAmount": 10.5,
  "idempotencyKey": "<중복 방지 키>",
  "partnerCode": "s01"
}`}</pre>
        <p className="setting-desc">
          환산: <code>partners.usdt_to_game_rate</code> (기본 1). 게임 금액은 소수 둘째 자리 내림.
        </p>
      </div>

      <div className="panel stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          5. 솔루션 환경 변수 예시
        </h2>
        <pre className="api-doc-pre">{`TPS_API_BASE_URL=https://bgp-001.com
TPS_PARTNER_KEY=<개인키>
TPS_CALLBACK_SECRET=...`}</pre>
        <p className="setting-desc">
          TPS 측에는 파트너 행(<code>partners</code>)에 공개키, 개인키 해시·암호문, 콜백 URL/시크릿, 가상 입금 주소,
          (선택) 에이전트·수수료%가 저장됩니다. 키 값은{' '}
          <a href="/admin/solution-keys">API 키 관리</a>에서 공개키·개인키로 확인합니다.
        </p>
      </div>

      <div className="panel stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          6. 참고
        </h2>
        <ul className="api-doc-list">
          <li>
            아이디(<code>loginId</code>)는 이메일 형식이 아닌 일반 텍스트이며, TPS에서는{' '}
            <strong>소문자</strong>로 저장·조회합니다.
          </li>
          <li>회원 OTC 구매·환전·외부 출금은 TPS 웹(<code>/app</code>)에서 진행합니다.</li>
          <li>
            솔루션당 에이전트 1명: 담당 솔루션 회원 트랜잭션·정산 조회용 (<code>/agent</code>).
          </li>
          <li>
            영문 스펙 원문: 저장소 <code>06_docs/02_partner_api_v1.md</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
