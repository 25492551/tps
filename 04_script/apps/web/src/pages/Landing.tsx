import { Link } from 'react-router-dom';

export function Landing() {
  return (
    <div className="landing">
      <div className="hero">
        <div className="brand">
          Tether<span>Market</span>
        </div>
        <h1>유저 간 USDT와 원화를 안전하게 교환</h1>
        <p>
          양쪽이 관리자 계좌에 입금하고, 관리자 승인 후 홀드된 자산이 교환되는 P2P
          마켓입니다.
        </p>
        <div className="row">
          <Link className="btn" to="/login">
            로그인
          </Link>
          <Link className="btn secondary" to="/register">
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
