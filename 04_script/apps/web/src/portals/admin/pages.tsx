import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatKst, formatKrw, formatNum, round2, statusBadge } from '../../lib/api';
import {
  ADMIN_NOTIFY_SOUND_IDS,
  ADMIN_NOTIFY_SOUND_LABELS,
  type AdminNotifyPrefs,
  loadAdminNotifyPrefs,
  playAdminNotifyAlert,
  saveAdminNotifyPrefs,
  unlockAdminNotifyAudio,
} from '../../lib/adminNotify';
import {
  ColumnFilterRow,
  TableCount,
  TableHeaderRow,
  filterCols,
  useMultiFilters,
  type FilterFieldDef,
} from '../../lib/tableFilters';
import { openMemberWindow } from '../../lib/memberWindow';
import { PeriodRange, periodRangeText } from '../../lib/PeriodRange';
import { DepositSeriesChart } from '../shared/DepositSeriesChart';

export function AdminHome() {
  return (
    <div>
      <DepositSeriesChart endpoint="/api/admin/deposit-series" portal="admin" />
    </div>
  );
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState<'member' | 'agent'>('member');
  const [createPartnerId, setCreatePartnerId] = useState('');
  const [editUser, setEditUser] = useState<any | null>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<{ userId: string; address: string; privateKey: string } | null>(
    null,
  );
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'displayName', label: '이름', get: (r) => String(r.displayName ?? '') },
      { key: 'email', label: '아이디', get: (r) => String(r.email ?? '') },
      {
        key: 'role',
        label: '역할',
        type: 'select',
        options: [
          { value: 'member', label: '회원' },
          { value: 'agent', label: '에이전트' },
          { value: 'admin', label: '관리자' },
        ],
        get: (r) => String(r.role ?? ''),
      },
      { key: 'solutionName', label: '솔루션', get: (r) => String(r.solutionName ?? '') },
      {
        key: 'wallet',
        label: '기본 지갑',
        get: (r) => String(r.managedWalletAddress ?? ''),
      },
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: [
          { value: 'pending_approval', label: 'pending_approval' },
          { value: 'active', label: 'active' },
          { value: 'rejected', label: 'rejected' },
          { value: 'suspended', label: 'suspended' },
        ],
        get: (r) => String(r.status ?? ''),
      },
      {
        key: 'canBuy',
        label: '구매',
        type: 'select',
        options: [
          { value: 'ON', label: 'ON' },
          { value: 'OFF', label: 'OFF' },
        ],
        get: (r) =>
          r.role === 'member' || r.role === 'agent' ? (r.canBuyTether ? 'ON' : 'OFF') : '',
      },
      {
        key: 'canSell',
        label: '판매',
        type: 'select',
        options: [
          { value: 'ON', label: 'ON' },
          { value: 'OFF', label: 'OFF' },
        ],
        get: (r) =>
          r.role === 'member' || r.role === 'agent' ? (r.canSellTether ? 'ON' : 'OFF') : '',
      },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, users);
  const userCols = filterCols(fields, [
    'displayName',
    'email',
    'role',
    'solutionName',
    'wallet',
    'status',
    'canBuy',
    'canSell',
    null,
  ]);
  async function load() {
    const data = await api<{ users: any[] }>('/api/admin/users');
    setUsers(data.users);
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
    void api<{ partners: any[] }>('/api/admin/partners')
      .then((d) => setPartners(d.partners))
      .catch(() => {});
  }, []);
  async function act(id: string, action: 'approve' | 'reject' | 'suspend') {
    setError('');
    try {
      await api(`/api/admin/users/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 실패');
    }
  }
  async function setPerm(id: string, patch: { canBuyTether?: boolean; canSellTether?: boolean }) {
    setBusyId(id);
    setError('');
    try {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', json: patch });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '권한 변경 실패');
    } finally {
      setBusyId('');
    }
  }
  async function revealKey(id: string) {
    setError('');
    try {
      const data = await api<{ wallet: { address: string; privateKey: string | null } }>(
        `/api/admin/users/${id}/managed-wallet`,
      );
      if (!data.wallet.privateKey) {
        setError('프라이빗 키가 없습니다.');
        return;
      }
      setRevealed({ userId: id, address: data.wallet.address, privateKey: data.wallet.privateKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : '키 조회 실패');
    }
  }
  async function ensureWallet(id: string) {
    setError('');
    try {
      await api(`/api/admin/users/${id}/ensure-managed-wallet`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '지갑 생성 실패');
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setCreateError('');
    const role = String(fd.get('role') || 'member') as 'member' | 'agent';
    const partnerId = String(fd.get('partnerId') || '');
    const parentPartnerId = String(fd.get('parentPartnerId') || '');
    if (role === 'agent' && !partnerId) {
      setCreateError('에이전트는 솔루션을 선택해야 합니다.');
      return;
    }
    if (role === 'agent' && partnerId) {
      const taken = partners.find((p) => p.id === partnerId && p.agentUserId);
      if (taken) {
        setCreateError(
          `이미 에이전트가 지정된 솔루션입니다.${taken.agentLoginId ? ` (${taken.agentLoginId})` : ''}`,
        );
        return;
      }
    }
    const bankName = String(fd.get('bankName') || '').trim();
    const accountNo = String(fd.get('accountNo') || '').trim();
    const holderName = String(fd.get('holderName') || '').trim();
    const hasBank = !!(bankName || accountNo || holderName);
    if (hasBank && (!bankName || !accountNo || !holderName)) {
      setCreateError('원화 계좌는 은행명·계좌번호·예금주를 모두 입력하세요.');
      return;
    }
    try {
      await api('/api/admin/users', {
        method: 'POST',
        json: {
          loginId: fd.get('loginId'),
          password: fd.get('password'),
          displayName: fd.get('displayName'),
          status: fd.get('status') || 'active',
          role,
          ...(role === 'agent'
            ? {
                partnerId,
                parentPartnerId: parentPartnerId || null,
              }
            : {}),
          canBuyTether: fd.get('canBuyTether') === 'on',
          canSellTether: fd.get('canSellTether') === 'on',
          ...(hasBank
            ? {
                bank: {
                  bankName,
                  accountNo,
                  holderName,
                },
              }
            : {}),
        },
      });
      e.currentTarget.reset();
      setCreateRole('member');
      setCreatePartnerId('');
      setCreateOpen(false);
      await load();
      const partnersData = await api<{ partners: any[] }>('/api/admin/partners');
      setPartners(partnersData.partners);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '생성 실패');
    }
  }
  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editUser) return;
    const fd = new FormData(e.currentTarget);
    setEditError('');
    const password = String(fd.get('password') || '').trim();
    const role = String(fd.get('role') || 'member');
    const partnerId = String(fd.get('partnerId') || '');
    const json: Record<string, unknown> = {
      displayName: fd.get('displayName'),
      loginId: fd.get('loginId'),
      role,
    };
    if (password) json.password = password;
    if (role === 'agent' && partnerId) json.partnerId = partnerId;
    if (role === 'agent' && partnerId) {
      const taken = partners.find(
        (p) => p.id === partnerId && p.agentUserId && p.agentUserId !== editUser.id,
      );
      if (taken) {
        setEditError(
          `이미 에이전트가 지정된 솔루션입니다.${taken.agentLoginId ? ` (${taken.agentLoginId})` : ''}`,
        );
        return;
      }
    }
    try {
      await api(`/api/admin/users/${editUser.id}`, { method: 'PATCH', json });
      setEditUser(null);
      await load();
      const partnersData = await api<{ partners: any[] }>('/api/admin/partners');
      setPartners(partnersData.partners);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '수정 실패');
    }
  }
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">유저 관리</h1>
        <div className="page-header-actions">
          <button
            type="button"
            onClick={() => {
              setCreateError('');
              setCreateRole('member');
              setCreatePartnerId('');
              setCreateOpen(true);
            }}
          >
            회원 추가
          </button>
        </div>
      </div>
      <p className="page-sub">
        승인 시 기본 테더 지갑이 발급됩니다. 주소(공개키)를 클릭하면 private key를 팝업으로 볼 수 있습니다(관리자만). 승인 후에는 거절할 수 없고 정지만 가능합니다.
      </p>
      {error && <p className="error">{error}</p>}
      {revealed && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setRevealed(null)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-key-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="wallet-key-title">관리 지갑 키</h2>
              <button
                className="secondary modal-close"
                type="button"
                onClick={() => setRevealed(null)}
              >
                닫기
              </button>
            </div>
            <p className="modal-desc">외부에 공유하지 마세요. 닫으면 다시 숨깁니다.</p>
            <div className="stack">
              <div>
                <strong>주소 (공개키)</strong>
                <div style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{revealed.address}</div>
              </div>
              <div>
                <strong>Private key</strong>
                <div style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{revealed.privateKey}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {createOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <div className="modal-header">
              <h2 id="create-user-title">회원 추가</h2>
              <button className="secondary modal-close" type="button" onClick={() => setCreateOpen(false)}>
                닫기
              </button>
            </div>
            <p className="modal-desc">
              아이디는 이메일 형식이 아닌 일반 텍스트입니다. 에이전트는 솔루션당 1명(이미 있으면 생성
              거절) · 상부는 솔루션 트리 기준입니다.
            </p>
            {createError && <p className="error">{createError}</p>}
            <form className="stack" onSubmit={create}>
              <label>
                이름
                <input name="displayName" required autoFocus />
              </label>
              <label>
                아이디
                <input name="loginId" type="text" autoComplete="off" required pattern="[A-Za-z0-9._+\-]{1,80}" />
              </label>
              <label>
                비밀번호
                <input name="password" required minLength={6} />
              </label>
              <label>
                역할
                <select
                  name="role"
                  value={createRole}
                  onChange={(e) => {
                    const next = e.target.value === 'agent' ? 'agent' : 'member';
                    setCreateRole(next);
                    if (next !== 'agent') setCreatePartnerId('');
                  }}
                >
                  <option value="member">회원</option>
                  <option value="agent">에이전트</option>
                </select>
              </label>
              {createRole === 'agent' && (
                <>
                  <label>
                    솔루션
                    <select
                      name="partnerId"
                      required
                      value={createPartnerId}
                      onChange={(e) => setCreatePartnerId(e.target.value)}
                    >
                      <option value="">— 선택 —</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id} disabled={!!p.agentUserId}>
                          {p.name} ({p.code})
                          {p.agentLoginId ? ` · agent=${p.agentLoginId} (지정됨)` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    상부
                    <select name="parentPartnerId" defaultValue="">
                      <option value="">— 관리자 직속 —</option>
                      {partners
                        .filter((p) => p.id !== createPartnerId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code})
                            {p.agentLoginId ? ` · ${p.agentLoginId}` : ''}
                            {` · ${p.agentFeePercent ?? 0}%`}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              <label>
                상태
                <select name="status" defaultValue="active">
                  <option value="active">active</option>
                  <option value="pending_approval">pending_approval</option>
                </select>
              </label>
              <div className="perm-check-row">
                <label className="member-check">
                  <input name="canBuyTether" type="checkbox" defaultChecked />
                  <span>구매 권한</span>
                </label>
                <label className="member-check">
                  <input name="canSellTether" type="checkbox" defaultChecked />
                  <span>판매 권한</span>
                </label>
              </div>
              <div className="modal-bank-block">
                <p className="modal-bank-title">원화 통장 (선택)</p>
                <label>
                  은행명
                  <input name="bankName" placeholder="국민은행" autoComplete="off" autoFocus />
                </label>
                <label>
                  계좌번호
                  <input name="accountNo" placeholder="숫자만" autoComplete="off" />
                </label>
                <label>
                  예금주
                  <input name="holderName" autoComplete="off" />
                </label>
              </div>
              <div className="modal-actions">
                <button type="submit">추가</button>
              </div>
            </form>
          </div>
        </div>
      )}      {editUser && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
            <div className="modal-header">
              <h2 id="edit-user-title">회원 수정</h2>
              <button className="secondary modal-close" type="button" onClick={() => setEditUser(null)}>
                닫기
              </button>
            </div>
            <p className="modal-desc">
              비밀번호는 비워 두면 변경하지 않습니다. 에이전트는 솔루션당 1명(이미 있으면 지정 거절)입니다.
            </p>
            {editError && <p className="error">{editError}</p>}
            <form className="stack" onSubmit={saveEdit} key={editUser.id}>
              <label>
                이름
                <input name="displayName" required defaultValue={editUser.displayName} autoFocus />
              </label>
              <label>
                아이디
                <input
                  name="loginId"
                  type="text"
                  autoComplete="off"
                  required
                  pattern="[A-Za-z0-9._+\-]{1,80}"
                  defaultValue={editUser.email}
                />
              </label>
              <label>
                역할
                <select name="role" defaultValue={editUser.role === 'agent' ? 'agent' : 'member'}>
                  <option value="member">회원</option>
                  <option value="agent">에이전트</option>
                </select>
              </label>
              <label>
                솔루션 (agent일 때)
                <select
                  name="partnerId"
                  defaultValue={partners.find((p) => p.agentUserId === editUser.id)?.id || ''}
                >
                  <option value="">— 선택 —</option>
                  {partners.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={!!p.agentUserId && p.agentUserId !== editUser.id}
                    >
                      {p.name} ({p.code})
                      {p.agentLoginId ? ` · agent=${p.agentLoginId}` : ''}
                      {p.agentUserId && p.agentUserId !== editUser.id ? ' (지정됨)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                새 비밀번호
                <input name="password" type="password" minLength={6} placeholder="변경 시에만 입력" />
              </label>
              <div className="modal-actions">
                <button type="submit">저장</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="panel table-scroll">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={userCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={userCols} />
            </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.displayName}</td>
                <td>
                  {u.role === 'admin' ? (
                    u.email
                  ) : (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => openMemberWindow('admin', u.email)}
                    >
                      {u.email}
                    </button>
                  )}
                </td>
                <td>
                  <span
                    className={`badge ${
                      u.role === 'agent' ? 'warn' : u.role === 'admin' ? 'ok' : statusBadge('member')
                    }`}
                  >
                    {u.role === 'admin' ? '관리자' : u.role === 'agent' ? '에이전트' : '회원'}
                  </span>
                </td>
                <td>{u.solutionName || '—'}</td>
                <td style={{ maxWidth: 180, wordBreak: 'break-all', fontSize: '0.85rem' }}>
                  {(u.role === 'member' || u.role === 'agent') ? (
                    u.managedWalletAddress ? (
                      <button
                        type="button"
                        className="link-btn"
                        title="클릭하면 private key 표시"
                        onClick={() => void revealKey(u.id)}
                        style={{ wordBreak: 'break-all', textAlign: 'left' }}
                      >
                        {u.managedWalletAddress}
                      </button>
                    ) : (
                      <button className="secondary" type="button" onClick={() => void ensureWallet(u.id)}>
                        지갑 생성
                      </button>
                    )
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  <span className={`badge ${statusBadge(u.status)}`}>{u.status}</span>
                </td>
                <td>
                  {(u.role === 'member' || u.role === 'agent') ? (
                    <button
                      type="button"
                      className={`toggle ${u.canBuyTether ? 'on' : ''}`}
                      role="switch"
                      aria-checked={!!u.canBuyTether}
                      disabled={busyId === u.id}
                      onClick={() => void setPerm(u.id, { canBuyTether: !u.canBuyTether })}
                      title="테더 구매 권한"
                    >
                      <span className="toggle-knob" />
                      <span className="toggle-label">{u.canBuyTether ? 'ON' : 'OFF'}</span>
                    </button>
                  ) : (
                    <span className="badge ok">전체</span>
                  )}
                </td>
                <td>
                  {(u.role === 'member' || u.role === 'agent') ? (
                    <button
                      type="button"
                      className={`toggle ${u.canSellTether ? 'on' : ''}`}
                      role="switch"
                      aria-checked={!!u.canSellTether}
                      disabled={busyId === u.id}
                      onClick={() => void setPerm(u.id, { canSellTether: !u.canSellTether })}
                      title="테더 판매 권한"
                    >
                      <span className="toggle-knob" />
                      <span className="toggle-label">{u.canSellTether ? 'ON' : 'OFF'}</span>
                    </button>
                  ) : (
                    <span className="badge ok">전체</span>
                  )}
                </td>
                <td className="actions-cell">
                  <div className="table-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => {
                        setEditError('');
                        setEditUser(u);
                      }}
                    >
                      수정
                    </button>
                    {(u.role === 'member' || u.role === 'agent') && u.status !== 'active' && (
                      <button type="button" onClick={() => act(u.id, 'approve')}>
                        승인
                      </button>
                    )}
                    {(u.role === 'member' || u.role === 'agent') && u.status === 'pending_approval' && (
                      <button className="secondary" type="button" onClick={() => act(u.id, 'reject')}>
                        거절
                      </button>
                    )}
                    {(u.role === 'member' || u.role === 'agent') && u.status === 'active' && (
                      <button className="danger" type="button" onClick={() => act(u.id, 'suspend')}>
                        정지
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9}>
                  {users.length ? '필터 조건에 맞는 유저가 없습니다.' : '유저가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminBankRequestsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'createdAt', label: '요청 시각', get: (r) => formatKst(r.createdAt) },
      { key: 'loginId', label: '아이디', get: (r) => String(r.loginId ?? '') },
      { key: 'displayName', label: '이름', get: (r) => String(r.displayName ?? '') },
      { key: 'bankName', label: '은행', get: (r) => String(r.bankName ?? '') },
      { key: 'accountNo', label: '계좌', get: (r) => String(r.accountNo ?? '') },
      { key: 'holderName', label: '예금주', get: (r) => String(r.holderName ?? '') },
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: [
          { value: 'pending', label: 'pending' },
          { value: 'approved', label: 'approved' },
          { value: 'rejected', label: 'rejected' },
        ],
        get: (r) => String(r.status ?? ''),
      },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, rows);
  const bankReqCols = filterCols(fields, [
    'createdAt',
    'loginId',
    'displayName',
    'bankName',
    'accountNo',
    'holderName',
    'status',
    null,
  ]);
  async function load() {
    const data = await api<{ requests: any[] }>('/api/admin/bank-requests?status=all');
    setRows(data.requests);
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);
  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError('');
    try {
      await api(`/api/admin/bank-requests/${id}/${action}`, {
        method: 'POST',
        json: action === 'reject' ? { note: '거절' } : {},
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 실패');
    } finally {
      setBusyId('');
    }
  }
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">계좌 변경 승인</h1>
        <div className="page-header-actions">
          <button className="secondary" type="button" onClick={() => void load()}>
            새로고침
          </button>
        </div>
      </div>
      <p className="page-sub">회원이 요청한 원화 계좌 등록·변경을 승인하거나 거절합니다.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel table-scroll">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={bankReqCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={bankReqCols} />
            </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{formatKst(r.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => openMemberWindow('admin', r.loginId)}
                  >
                    {r.loginId}
                  </button>
                </td>
                <td>{r.displayName}</td>
                <td>
                  {r.bankName}
                </td>
                <td>{r.accountNo}</td>
                <td>{r.holderName}</td>
                <td>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </td>
                <td className="actions-cell">
                  {r.status === 'pending' ? (
                    <div className="table-actions">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, 'approve')}
                      >
                        승인
                      </button>
                      <button
                        className="danger"
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, 'reject')}
                      >
                        거절
                      </button>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={8}>
                  {rows.length ? '필터 조건에 맞는 요청이 없습니다.' : '요청이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminHoldsPage() {
  const [data, setData] = useState<{ trades: any[]; holds: any[] }>({ trades: [], holds: [] });
  const [error, setError] = useState('');
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      {
        key: 'kind',
        label: '유형',
        type: 'select',
        options: [
          { value: 'buy_from_admin', label: '구매' },
          { value: 'sell_to_admin', label: '판매' },
        ],
        get: (r) => String(r.kind ?? ''),
      },
      { key: 'id', label: '거래 ID', get: (r) => String(r.id ?? '') },
      {
        key: 'requester_login_id',
        label: '아이디',
        get: (r) => String(r.requester_login_id ?? ''),
      },
      {
        key: 'requester_display_name',
        label: '이름',
        get: (r) => String(r.requester_display_name ?? ''),
      },
      {
        key: 'solution_name',
        label: '솔루션',
        get: (r) => String(r.solution_name ?? r.solution_code ?? ''),
      },
      {
        key: 'requester_bank_name',
        label: '은행',
        get: (r) => String(r.requester_bank_name ?? ''),
      },
      {
        key: 'requester_account_no',
        label: '계좌번호',
        get: (r) => String(r.requester_account_no ?? ''),
      },
      {
        key: 'requester_holder_name',
        label: '예금주',
        get: (r) => String(r.requester_holder_name ?? ''),
      },
      { key: 'status', label: '상태', get: (r) => String(r.status ?? '') },
      {
        key: 'created_at',
        label: '요청 시각',
        get: (r) => (r.created_at ? formatKst(r.created_at) : ''),
      },
      {
        key: 'amount',
        label: '금액',
        align: 'right',
        get: (r) => `${r.amount_usdt ?? ''} ${r.amount_krw ?? ''}`,
      },
      {
        key: 'krw_deposit_status',
        label: 'KRW',
        get: (r) => String(r.krw_deposit_status ?? ''),
      },
      {
        key: 'usdt_deposit_status',
        label: 'USDT',
        get: (r) => String(r.usdt_deposit_status ?? ''),
      },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, data.trades);
  const holdsCols = filterCols(fields, [
    'created_at',
    'kind',
    'requester_login_id',
    'requester_display_name',
    'solution_name',
    'requester_bank_name',
    'requester_account_no',
    'requester_holder_name',
    'id',
    'amount',
    'krw_deposit_status',
    'usdt_deposit_status',
    'status',
    null,
  ]);
  async function load() {
    setData(await api('/api/admin/holds'));
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);
  async function confirm(id: string, side: 'krw' | 'usdt') {
    try {
      // #region agent log
      fetch('http://localhost:7603/ingest/16484438-b468-4662-a4bc-8cd4b1e4f72a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '307f1d' },
        body: JSON.stringify({
          sessionId: '307f1d',
          hypothesisId: 'D',
          location: 'admin/pages.tsx:confirm',
          message: 'admin UI confirm click',
          data: { id: id.slice(0, 8), side },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      await api(`/api/trades/${id}/deposits/${side}/confirm`, {
        method: 'POST',
        json: { proofNote: 'admin confirmed' },
      });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '확인 실패';
      // #region agent log
      fetch('http://localhost:7603/ingest/16484438-b468-4662-a4bc-8cd4b1e4f72a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '307f1d' },
        body: JSON.stringify({
          sessionId: '307f1d',
          hypothesisId: 'B',
          location: 'admin/pages.tsx:confirm:catch',
          message: 'admin UI confirm error shown',
          data: { id: id.slice(0, 8), side, msg },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setError(msg);
    }
  }
  async function cancel(id: string) {
    try {
      await api(`/api/trades/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '취소 실패');
    }
  }
  function kindLabel(t: any) {
    if (t.kind === 'buy_from_admin') return '구매';
    if (t.kind === 'sell_to_admin') return '판매';
    return t.kind || 'P2P';
  }
  return (
    <div>
      <h1 className="page-title">OTC 입금·지급</h1>
      <p className="page-sub">KRW 확인 시 USDT 잔고 지급. 환전(판매) 확인 시 장부 정산. 원화는 오프라인 지급 · 외부 출금만 온체인 전송.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel table-scroll">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={holdsCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={holdsCols} />
            </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td>{t.created_at ? formatKst(t.created_at) : '—'}</td>
                <td>{kindLabel(t)}</td>
                <td>
                  {t.requester_login_id ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => openMemberWindow('admin', t.requester_login_id)}
                    >
                      {t.requester_login_id}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{t.requester_display_name || '—'}</td>
                <td>
                  {t.solution_name
                    ? `${t.solution_name}${t.solution_code ? ` (${t.solution_code})` : ''}`
                    : '—'}
                </td>
                <td>
                  {t.requester_bank_name
                    ? `${t.requester_bank_name}`
                    : '—'}
                </td>
                <td>{t.requester_account_no || '—'}</td>
                <td>{t.requester_holder_name || '—'}</td>
                <td>{t.id.slice(0, 8)}…</td>
                <td className="col-amount">
                  {formatNum(t.amount_usdt)} USDT / {formatKrw(t.amount_krw)} KRW
                </td>
                <td>
                  <span className={`badge ${statusBadge(t.krw_deposit_status || '-')}`}>
                    {t.krw_deposit_status || '-'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${statusBadge(t.usdt_deposit_status || '-')}`}>
                    {t.usdt_deposit_status || '-'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                </td>
                <td className="actions-cell">
                  <div className="table-actions">
                    {(t.kind === 'buy_from_admin' || !t.kind || t.kind === 'legacy_p2p') &&
                      !['completed', 'cancelled', 'settling_onchain'].includes(t.status) && (
                      <button type="button" onClick={() => confirm(t.id, 'krw')}>
                        KRW 확인·USDT 지급
                      </button>
                    )}
                    {(t.kind === 'sell_to_admin' || !t.kind || t.kind === 'legacy_p2p') &&
                      !['completed', 'cancelled', 'settling_onchain'].includes(t.status) && (
                      <button type="button" onClick={() => confirm(t.id, 'usdt')}>
                        환전 정산(장부)
                      </button>
                    )}
                    <button className="danger" type="button" onClick={() => cancel(t.id)}>
                      취소/환불
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={14}>
                  {data.trades.length ? '필터 조건에 맞는 거래가 없습니다.' : '대기 중인 거래가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RateProvider = {
  id: string;
  name: string;
  siteUrl: string;
  description: string;
  pair: string;
};

type RateQuote = {
  providerId: string;
  rateKrwPerUsdt: number | null;
  fetchedAt: string;
  error?: string;
  rawNote?: string;
};

export function AdminRatesPage() {
  const [providers, setProviders] = useState<RateProvider[]>([]);
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
  const [selected, setSelected] = useState('');
  const [buyFeePercent, setBuyFeePercent] = useState(0);
  const [sellFeePercent, setSellFeePercent] = useState(0);
  const [buyFeeDraft, setBuyFeeDraft] = useState('0');
  const [sellFeeDraft, setSellFeeDraft] = useState('0');
  const [refreshInterval, setRefreshInterval] = useState('1h');
  const [refreshDraft, setRefreshDraft] = useState('1h');
  const [refreshOptions, setRefreshOptions] = useState<
    { id: string; labelKo: string; seconds: number }[]
  >([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [feeBusy, setFeeBusy] = useState(false);
  const [intervalBusy, setIntervalBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const d = await api<{
        selectedProviderId: string;
        fxBuyFeePercent: number;
        fxSellFeePercent: number;
        fxRateRefreshInterval: string;
        fxRateSnapshot: { fetchedAt: string } | null;
        refreshIntervals: { id: string; labelKo: string; seconds: number }[];
        providers: RateProvider[];
        quotes: RateQuote[];
      }>('/api/admin/rates');
      setProviders(d.providers);
      setQuotes(d.quotes);
      setSelected(d.selectedProviderId);
      setBuyFeePercent(d.fxBuyFeePercent ?? 0);
      setSellFeePercent(d.fxSellFeePercent ?? 0);
      setBuyFeeDraft(String(d.fxBuyFeePercent ?? 0));
      setSellFeeDraft(String(d.fxSellFeePercent ?? 0));
      setRefreshInterval(d.fxRateRefreshInterval || '1h');
      setRefreshDraft(d.fxRateRefreshInterval || '1h');
      setRefreshOptions(d.refreshIntervals || []);
      setSnapshotAt(d.fxRateSnapshot?.fetchedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function quoteFor(id: string) {
    return quotes.find((q) => q.providerId === id);
  }

  async function refreshOne(id: string) {
    setBusyId(id);
    setError('');
    try {
      const d = await api<{ quote: RateQuote }>(`/api/admin/rates/${id}`);
      setQuotes((prev) => {
        const rest = prev.filter((q) => q.providerId !== id);
        return [...rest, d.quote];
      });
      if (id === selected && d.quote.rateKrwPerUsdt != null) {
        setSnapshotAt(d.quote.fetchedAt);
        setMsg(`선택 소스 현재가 갱신 · ${formatNum(d.quote.rateKrwPerUsdt)} KRW/USDT`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setBusyId('');
    }
  }

  async function selectProvider(id: string) {
    setBusyId(id);
    setError('');
    setMsg('');
    try {
      const d = await api<{
        selectedProviderId: string;
        fxRateSnapshot: { fetchedAt: string } | null;
        quote: RateQuote;
      }>('/api/admin/rates/select', {
        method: 'POST',
        json: { providerId: id },
      });
      setSelected(d.selectedProviderId);
      setSnapshotAt(d.fxRateSnapshot?.fetchedAt ?? d.quote.fetchedAt);
      setQuotes((prev) => {
        const rest = prev.filter((q) => q.providerId !== id);
        return [...rest, d.quote];
      });
      setMsg(
        `${providers.find((p) => p.id === id)?.name || id} 선택됨 · 현재 ${formatNum(
          d.quote.rateKrwPerUsdt,
        )} KRW/USDT`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '선택 실패');
    } finally {
      setBusyId('');
    }
  }

  async function saveFee(e: FormEvent) {
    e.preventDefault();
    setFeeBusy(true);
    setError('');
    setMsg('');
    try {
      const d = await api<{ fxBuyFeePercent: number; fxSellFeePercent: number }>('/api/admin/rates/fee', {
        method: 'POST',
        json: {
          fxBuyFeePercent: Number(buyFeeDraft),
          fxSellFeePercent: Number(sellFeeDraft),
        },
      });
      setBuyFeePercent(d.fxBuyFeePercent);
      setSellFeePercent(d.fxSellFeePercent);
      setBuyFeeDraft(String(d.fxBuyFeePercent));
      setSellFeeDraft(String(d.fxSellFeePercent));
      setMsg(
        `구매 수수료 ${formatNum(d.fxBuyFeePercent)}% / 판매 수수료 ${formatNum(d.fxSellFeePercent)}% 로 저장되었습니다.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '수수료 저장 실패');
    } finally {
      setFeeBusy(false);
    }
  }

  async function saveInterval(e: FormEvent) {
    e.preventDefault();
    setIntervalBusy(true);
    setError('');
    setMsg('');
    try {
      const d = await api<{ fxRateRefreshInterval: string }>('/api/admin/rates/refresh-interval', {
        method: 'POST',
        json: { interval: refreshDraft },
      });
      setRefreshInterval(d.fxRateRefreshInterval);
      setRefreshDraft(d.fxRateRefreshInterval);
      const label =
        refreshOptions.find((o) => o.id === d.fxRateRefreshInterval)?.labelKo || d.fxRateRefreshInterval;
      setMsg(`업데이트 주기 ${label} 로 저장되었습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주기 저장 실패');
    } finally {
      setIntervalBusy(false);
    }
  }

  const spot = quoteFor(selected)?.rateKrwPerUsdt;
  const buyRate =
    spot != null ? Math.round(spot * (1 + buyFeePercent / 100) * 100) / 100 : null;
  const sellRate =
    spot != null ? Math.round(spot * (1 - sellFeePercent / 100) * 100) / 100 : null;
  const intervalLabel =
    refreshOptions.find((o) => o.id === refreshInterval)?.labelKo || refreshInterval;

  return (
    <div>
      <h1 className="page-title">환율</h1>
      <p className="page-sub">
        USDT↔KRW 참고 환율 소스와 테더 구매·판매 수수료(%)를 각각 설정합니다. 선택 소스 시세는
        업데이트 주기 동안 재사용됩니다.
      </p>
      <div className="panel">
        <div className="panel-head">
          <h3>업데이트 주기</h3>
        </div>
        <form className="row" onSubmit={saveInterval} style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: '0 0 200px' }}>
            OTC 시세 갱신
            <select value={refreshDraft} onChange={(ev) => setRefreshDraft(ev.target.value)}>
              {(refreshOptions.length
                ? refreshOptions
                : [
                    { id: '1h', labelKo: '1시간' },
                    { id: '6h', labelKo: '6시간' },
                    { id: '1d', labelKo: '1일' },
                    { id: '3d', labelKo: '3일' },
                    { id: '1w', labelKo: '1주' },
                  ]
              ).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.labelKo}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={intervalBusy}>
            저장
          </button>
        </form>
        <p className="setting-desc" style={{ marginBottom: 0 }}>
          현재 {intervalLabel}
          {snapshotAt ? ` · 마지막 시세 ${formatKst(snapshotAt)}` : ''}
        </p>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h3>수수료 (%)</h3>
        </div>
        <form className="row" onSubmit={saveFee} style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: '0 0 160px' }}>
            테더 구매 수수료
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={buyFeeDraft}
              onChange={(ev) => setBuyFeeDraft(ev.target.value)}
              required
            />
          </label>
          <label style={{ flex: '0 0 160px' }}>
            테더 판매 수수료
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={sellFeeDraft}
              onChange={(ev) => setSellFeeDraft(ev.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={feeBusy}>
            저장
          </button>
        </form>
        <p className="setting-desc" style={{ marginBottom: 0 }}>
          현재 구매 {formatNum(buyFeePercent)}% / 판매 {formatNum(sellFeePercent)}%
          {spot != null && buyRate != null && sellRate != null && (
            <>
              {' '}
              · 선택 소스 기준 구매 {formatNum(buyRate)} / 판매 {formatNum(sellRate)} KRW/USDT
            </>
          )}
        </p>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && (
        <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(var(--accent-rgb), 0.35)' }}>
          {msg}
        </p>
      )}
      <div className="panel rate-sources">
        <div className="panel-head">
          <h3>시세 소스</h3>
          <div className="panel-head-actions">
            <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>
              전체 새로고침
            </button>
          </div>
        </div>
        {loading ? (
          <p>환율을 불러오는 중…</p>
        ) : (
          <table className="rate-table">
            <thead>
              <tr>
                <th>소스</th>
                <th>설명</th>
                <th className="col-amount">시세</th>
                <th>조회</th>
                <th>페어</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => {
                const q = quoteFor(p.id);
                const active = selected === p.id;
                return (
                  <tr key={p.id} className={active ? 'rate-row-active' : undefined}>
                    <td>
                      <strong className="rate-card-name">{p.name}</strong>
                    </td>
                    <td>
                      <span className="setting-desc" style={{ margin: 0 }}>
                        {p.description}
                      </span>
                      {q?.rawNote ? (
                        <div className="setting-desc" style={{ margin: '0.25rem 0 0' }}>
                          {q.rawNote}
                        </div>
                      ) : null}
                    </td>
                    <td className="col-amount">
                      {q?.rateKrwPerUsdt != null ? (
                        <>
                          <span className="rate-num">{formatNum(q.rateKrwPerUsdt)}</span>
                          <span className="rate-unit"> KRW/USDT</span>
                        </>
                      ) : (
                        <span className="error" style={{ margin: 0 }}>
                          {q?.error || '환율 없음'}
                        </span>
                      )}
                    </td>
                    <td>{q?.fetchedAt ? formatKst(q.fetchedAt) : '—'}</td>
                    <td>{p.pair}</td>
                    <td className="actions-cell">
                      <div className="table-actions">
                        <a className="btn secondary" href={p.siteUrl} target="_blank" rel="noreferrer">
                          사이트
                        </a>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busyId === p.id}
                          onClick={() => void refreshOne(p.id)}
                        >
                          현재가
                        </button>
                        {active ? (
                          <button type="button" disabled className="rate-selected-label">
                            선택됨
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === p.id || q?.rateKrwPerUsdt == null}
                            onClick={() => void selectProvider(p.id)}
                          >
                            선택
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function AdminSettingsPage() {
  const [allowMulti, setAllowMulti] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [notifyPrefs, setNotifyPrefs] = useState(() => loadAdminNotifyPrefs());
  const [notifyMsg, setNotifyMsg] = useState('');

  useEffect(() => {
    void api<{ settings: { allowMultiAccountBrowser: boolean } }>('/api/admin/settings')
      .then((d) => {
        setAllowMulti(d.settings.allowMultiAccountBrowser);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e.message));
        setLoading(false);
      });
  }, []);

  function updateNotify(patch: Partial<AdminNotifyPrefs>) {
    const next = { ...notifyPrefs, ...patch };
    if (typeof next.repeatCount === 'number') {
      next.repeatCount = Math.min(10, Math.max(1, Math.round(next.repeatCount)));
    }
    if (typeof next.volume === 'number') {
      next.volume = Math.min(100, Math.max(0, Math.round(next.volume)));
    }
    setNotifyPrefs(next);
    saveAdminNotifyPrefs(next);
    setNotifyMsg('알림 설정을 이 브라우저에 저장했습니다.');
  }

  async function toggle() {
    const next = !allowMulti;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const d = await api<{ settings: { allowMultiAccountBrowser: boolean } }>(
        '/api/admin/settings',
        { method: 'PATCH', json: { allowMultiAccountBrowser: next } },
      );
      setAllowMulti(d.settings.allowMultiAccountBrowser);
      setSaved(next ? '중복 로그인이 켜졌습니다.' : '중복 로그인이 꺼졌습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">사이트 설정</h1>
      <p className="page-sub">전체 사이트에 적용되는 운영 옵션입니다.</p>
      {error && <p className="error">{error}</p>}
      {saved && (
        <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(var(--accent-rgb), 0.35)' }}>
          {saved}
        </p>
      )}
      <div className="panel">
        <div className="setting-row">
          <div>
            <div className="setting-title">중복 로그인</div>
            <p className="setting-desc">
              같은 브라우저에서 여러 아이디로 로그인하는 것을 허용합니다. 끄면 한 브라우저에
              하나의 유저 계정만 로그인할 수 있으며, 다른 계정은 로그아웃 후에만 가능합니다.
              (관리자 계정은 예외)
            </p>
          </div>
          <button
            type="button"
            className={`toggle ${allowMulti ? 'on' : ''}`}
            role="switch"
            aria-checked={allowMulti}
            disabled={loading || saving}
            onClick={() => void toggle()}
          >
            <span className="toggle-knob" />
            <span className="toggle-label">{allowMulti ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      <div className="panel stack">
        <div>
          <div className="setting-title">OTC 알림</div>
          <p className="setting-desc">
            승인 대기 holds가 새로 들어오면 상단 바와 함께 알림음을 재생합니다. 이 브라우저에만
            저장됩니다.
          </p>
        </div>
        {notifyMsg && (
          <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(var(--accent-rgb), 0.35)' }}>
            {notifyMsg}
          </p>
        )}
        <div className="setting-row">
          <div>
            <div className="setting-title">알림음</div>
            <p className="setting-desc">신규 OTC 요청 시 재생합니다.</p>
          </div>
          <button
            type="button"
            className={`toggle ${notifyPrefs.enabled ? 'on' : ''}`}
            role="switch"
            aria-checked={notifyPrefs.enabled}
            onClick={() => updateNotify({ enabled: !notifyPrefs.enabled })}
          >
            <span className="toggle-knob" />
            <span className="toggle-label">{notifyPrefs.enabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
        <label>
          알림음 선택
          <select
            value={notifyPrefs.soundId}
            disabled={!notifyPrefs.enabled}
            onChange={(e) =>
              updateNotify({
                soundId: e.target.value as (typeof ADMIN_NOTIFY_SOUND_IDS)[number],
              })
            }
          >
            {ADMIN_NOTIFY_SOUND_IDS.map((id) => (
              <option key={id} value={id}>
                {ADMIN_NOTIFY_SOUND_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          반복 횟수 (1–10)
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            disabled={!notifyPrefs.enabled}
            value={notifyPrefs.repeatCount}
            onChange={(e) => updateNotify({ repeatCount: Number(e.target.value) || 1 })}
          />
        </label>
        <label>
          음량 ({notifyPrefs.volume}%)
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={!notifyPrefs.enabled}
            value={notifyPrefs.volume}
            onChange={(e) => updateNotify({ volume: Number(e.target.value) })}
          />
        </label>
        <div>
          <button
            type="button"
            className="secondary"
            disabled={!notifyPrefs.enabled}
            onClick={() => {
              unlockAdminNotifyAudio();
              void playAdminNotifyAlert(notifyPrefs).then((ok) => {
                setNotifyMsg(
                  ok
                    ? '테스트 알림음을 재생했습니다.'
                    : '재생에 실패했습니다. 브라우저 소리 권한을 확인해 주세요.',
                );
              });
            }}
          >
            알림음 테스트
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminTransactionsPage() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const urlLoginId = searchParams.get('loginId') || '';
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'created_at', label: '시각', get: (r) => formatKst(r.created_at) },
      { key: 'login_id', label: '아이디', get: (r) => String(r.login_id ?? '') },
      {
        key: 'asset',
        label: '자산',
        type: 'select',
        options: [
          { value: 'krw', label: 'krw' },
          { value: 'usdt', label: 'usdt' },
        ],
        get: (r) => String(r.asset ?? ''),
      },
      {
        key: 'direction',
        label: '방향',
        type: 'select',
        options: [
          { value: 'credit', label: '입금' },
          { value: 'debit', label: '출금' },
        ],
        get: (r) => String(r.direction ?? ''),
      },
      { key: 'amount', label: '금액', align: 'right', get: (r) => String(r.amount ?? '') },
      { key: 'balance_after', label: '잔액', align: 'right', get: (r) => String(r.balance_after ?? '') },
      { key: 'ref_type', label: 'ref', get: (r) => String(r.ref_type ?? '') },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, rows);
  const txCols = filterCols(fields, [
    'created_at',
    'login_id',
    'asset',
    'direction',
    'amount',
    'balance_after',
    'ref_type',
  ]);

  async function load() {
    const data = await api<{ transactions: any[] }>('/api/admin/transactions');
    setRows(data.transactions);
  }
  useEffect(() => {
    void load().catch(() => {});
  }, []);
  useEffect(() => {
    if (urlLoginId) setValue('login_id', urlLoginId);
  }, [urlLoginId, setValue]);
  return (
    <div>
      <h1 className="page-title">트랜잭션</h1>
      <div className="panel table-scroll">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={txCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={txCols} />
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td>{formatKst(t.created_at)}</td>
                <td>
                  {t.login_id ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => openMemberWindow('admin', t.login_id)}
                    >
                      {t.login_id}
                    </button>
                  ) : (
                    `${String(t.user_id).slice(0, 8)}…`
                  )}
                </td>
                <td>{t.asset}</td>
                <td>{t.direction === 'credit' ? '입금' : '출금'}</td>
                <td className="col-amount">{t.asset === 'krw' ? formatKrw(t.amount) : formatNum(t.amount)}</td>
                <td className="col-amount">
                  {t.asset === 'krw' ? formatKrw(t.balance_after) : formatNum(t.balance_after)}
                </td>
                <td>{t.ref_type}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  {rows.length ? '필터 조건에 맞는 내역이 없습니다.' : '내역이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CustodyWallet = {
  id: string;
  address: string;
  label: string;
  status: string;
  isDefault: boolean;
  hasPrivateKey: boolean;
  createdAt: string;
  balanceUsdt?: number | null;
  balanceFetchedAt?: string | null;
  balanceError?: string | null;
};

type CustodyTransfer = {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  fromAddress: string;
  fromLabel: string;
  toAddress: string;
  toLabel: string;
  amountUsdt: number;
  status: string;
  note: string;
  createdAt: string;
  completedAt: string | null;
};

export function AdminWalletsPage() {
  const [wallets, setWallets] = useState<CustodyWallet[]>([]);
  const [transfers, setTransfers] = useState<CustodyTransfer[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ address: string; privateKey: string } | null>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const walletFields = useMemo<FilterFieldDef<CustodyWallet>[]>(
    () => [
      { key: 'label', label: '라벨', get: (r) => String(r.label ?? '') },
      { key: 'address', label: '주소', get: (r) => String(r.address ?? '') },
      {
        key: 'balance',
        label: '잔고',
        align: 'right',
        get: (r) => (r.balanceUsdt != null ? String(r.balanceUsdt) : ''),
      },
      {
        key: 'hasPrivateKey',
        label: '키',
        type: 'select',
        options: [
          { value: '보관', label: '보관' },
          { value: '없음', label: '없음' },
        ],
        get: (r) => (r.hasPrivateKey ? '보관' : '없음'),
      },
      { key: 'status', label: '상태', get: (r) => String(r.status ?? '') },
    ],
    [],
  );
  const walletFilter = useMultiFilters(walletFields, wallets);
  const transferFields = useMemo<FilterFieldDef<CustodyTransfer>[]>(
    () => [
      { key: 'createdAt', label: '시각', get: (r) => formatKst(r.createdAt) },
      { key: 'fromLabel', label: '출금', get: (r) => String(r.fromLabel ?? '') },
      { key: 'toLabel', label: '입금', get: (r) => String(r.toLabel ?? '') },
      { key: 'amountUsdt', label: '수량', align: 'right', get: (r) => String(r.amountUsdt ?? '') },
      { key: 'status', label: '상태', get: (r) => String(r.status ?? '') },
    ],
    [],
  );
  const transferFilter = useMultiFilters(transferFields, transfers);
  const walletCols = filterCols(walletFields, [
    'label',
    'address',
    'balance',
    'hasPrivateKey',
    'status',
    null,
  ]);
  const transferCols = filterCols(transferFields, [
    'createdAt',
    'fromLabel',
    'toLabel',
    'amountUsdt',
    'status',
    null,
  ]);

  async function load() {
    const d = await api<{
      wallets: CustodyWallet[];
      transfers: CustodyTransfer[];
    }>('/api/admin/wallets');
    setWallets(d.wallets);
    setTransfers(d.transfers);
    if (!fromId && d.wallets[0]) setFromId(d.wallets[0].id);
    if (!toId && d.wallets[1]) setToId(d.wallets[1].id);
  }

  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);

  async function createWallet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api('/api/admin/wallets/create', {
        method: 'POST',
        json: {
          label: fd.get('label') || '관리자 지갑',
          makeDefault: fd.get('makeDefault') === 'on',
        },
      });
      setCreateOpen(false);
      setMsg('지갑을 생성했습니다. 프라이빗 키가 저장되었습니다.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 실패');
    } finally {
      setBusy(false);
    }
  }

  async function registerWallet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const pk = String(fd.get('privateKey') || '').trim();
      await api('/api/admin/wallets/register', {
        method: 'POST',
        json: {
          address: fd.get('address'),
          label: fd.get('label') || '등록 지갑',
          privateKey: pk || undefined,
          makeDefault: fd.get('makeDefault') === 'on',
        },
      });
      setRegisterOpen(false);
      setMsg('지갑을 등록했습니다.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setError('');
    try {
      const d = await api<{ wallets: CustodyWallet[] }>(`/api/admin/wallets/${id}/set-default`, {
        method: 'POST',
      });
      setWallets(d.wallets);
      setMsg('OTC 입금용 기본 지갑으로 설정했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 실패');
    }
  }

  async function revealKey(id: string) {
    setError('');
    try {
      const d = await api<{ wallet: { address: string; privateKey: string } }>(
        `/api/admin/wallets/${id}/private-key`,
      );
      setRevealed({ address: d.wallet.address, privateKey: d.wallet.privateKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : '키 조회 실패');
    }
  }

  async function submitTransfer(e: FormEvent) {
    e.preventDefault();
    if (!fromId || !toId) {
      setError('출금·입금 지갑을 선택하세요.');
      return;
    }
    if (fromId === toId) {
      setError('출금과 입금 지갑은 달라야 합니다.');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api('/api/admin/wallets/transfer', {
        method: 'POST',
        json: {
          fromWalletId: fromId,
          toWalletId: toId,
          amountUsdt: round2(amount),
          note: note.trim() || undefined,
        },
      });
      setAmount('');
      setNote('');
      setMsg('이전 요청을 등록했습니다. 온체인 전송 후 완료 처리하세요.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이전 실패');
    } finally {
      setBusy(false);
    }
  }

  async function completeTransfer(id: string) {
    try {
      await api(`/api/admin/wallets/transfers/${id}/complete`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '완료 실패');
    }
  }

  async function cancelTransfer(id: string) {
    try {
      await api(`/api/admin/wallets/transfers/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '취소 실패');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">테더지갑</h1>
        <div className="page-header-actions">
          <button className="secondary" type="button" disabled={busy} onClick={() => void load()}>
            잔고 새로고침
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setRegisterOpen(true);
            }}
          >
            지갑 등록
          </button>
          <button type="button" onClick={() => setCreateOpen(true)}>
            지갑 생성
          </button>
        </div>
      </div>
      <p className="page-sub">
        관리자 보관(커스터디) TRC-20 지갑입니다. 기본 지갑이 OTC 판매 입금 안내 주소로 사용됩니다. 지갑 간
        이전은 온체인 전송 기록용이며, 전송 후 완료 처리하세요.
      </p>
      {error && <p className="error">{error}</p>}
      {msg && (
        <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(var(--accent-rgb), 0.35)' }}>
          {msg}
        </p>
      )}
      {revealed && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>프라이빗 키</h3>
          <p className="setting-desc">외부에 공유하지 마세요.</p>
          <div>
            <strong>주소</strong>
            <div style={{ wordBreak: 'break-all' }}>{revealed.address}</div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <strong>Private key</strong>
            <div style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{revealed.privateKey}</div>
          </div>
          <button className="secondary" type="button" style={{ marginTop: '0.75rem' }} onClick={() => setRevealed(null)}>
            숨기기
          </button>
        </div>
      )}
      <div className="panel table-scroll">
        <TableCount shown={walletFilter.shownCount} total={walletFilter.totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={walletCols}
              values={walletFilter.values}
              onChange={walletFilter.setValue}
            />
            <TableHeaderRow columns={walletCols} />
            </thead>
          <tbody>
            {walletFilter.filtered.map((w) => (
              <tr key={w.id}>
                <td>
                  {w.label}{' '}
                  {w.isDefault && <span className="badge ok">기본</span>}
                </td>
                <td style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{w.address}</td>
                <td className="col-amount">
                  {w.balanceUsdt != null ? `${formatNum(w.balanceUsdt)} USDT` : w.balanceError || '—'}
                </td>
                <td>{w.hasPrivateKey ? '보관' : '없음'}</td>
                <td>
                  <span className={`badge ${statusBadge(w.status)}`}>{w.status}</span>
                </td>
                <td className="actions-cell">
                  <div className="table-actions">
                    {!w.isDefault && (
                      <button className="secondary" type="button" onClick={() => void setDefault(w.id)}>
                        기본 설정
                      </button>
                    )}
                    {w.hasPrivateKey && (
                      <button className="secondary" type="button" onClick={() => void revealKey(w.id)}>
                        키 보기
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!walletFilter.filtered.length && (
              <tr>
                <td colSpan={6}>
                  {wallets.length
                    ? '필터 조건에 맞는 지갑이 없습니다.'
                    : '등록된 커스터디 지갑이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>지갑 간 이전</h3>
        <p className="setting-desc">
          온체인 USDT 이동을 기록합니다. 실제 전송은 출금 지갑 키로 별도 실행한 뒤 완료 처리하세요.
        </p>
        <form className="stack" onSubmit={submitTransfer}>
          <div className="row wallet-transfer-row">
            <label className="wallet-transfer-field">
              출금
              <select
                value={fromId}
                onChange={(e) => {
                  const next = e.target.value;
                  setFromId(next);
                  if (next && next === toId) setToId('');
                }}
                required
              >
                <option value="">선택</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.id === toId}>
                    {w.label} ({w.address.slice(0, 8)}…)
                  </option>
                ))}
              </select>
            </label>
            <label className="wallet-transfer-field">
              입금
              <select
                value={toId}
                onChange={(e) => {
                  const next = e.target.value;
                  setToId(next);
                  if (next && next === fromId) setFromId('');
                }}
                required
              >
                <option value="">선택</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.id === fromId}>
                    {w.label} ({w.address.slice(0, 8)}…)
                  </option>
                ))}
              </select>
            </label>
            <label className="wallet-transfer-field wallet-transfer-amount">
              수량 (USDT)
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="wallet-transfer-note">
            메모
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="선택" />
          </label>
          <button type="submit" disabled={busy || wallets.length < 2 || (!!fromId && fromId === toId)}>
            이전 등록
          </button>
        </form>
      </div>

      <div className="panel table-scroll">
        <h3 style={{ marginTop: 0 }}>이전 기록</h3>
        <TableCount shown={transferFilter.shownCount} total={transferFilter.totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={transferCols}
              values={transferFilter.values}
              onChange={transferFilter.setValue}
            />
            <TableHeaderRow columns={transferCols} />
            </thead>
          <tbody>
            {transferFilter.filtered.map((t) => (
              <tr key={t.id}>
                <td>{formatKst(t.createdAt)}</td>
                <td>
                  {t.fromLabel}
                  <div className="setting-desc" style={{ margin: 0 }}>
                    {t.fromAddress.slice(0, 12)}…
                  </div>
                </td>
                <td>
                  {t.toLabel}
                  <div className="setting-desc" style={{ margin: 0 }}>
                    {t.toAddress.slice(0, 12)}…
                  </div>
                </td>
                <td className="col-amount">{formatNum(t.amountUsdt)}</td>
                <td>
                  <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                </td>
                <td className="actions-cell">
                  {t.status === 'pending' && (
                    <div className="table-actions">
                      <button type="button" onClick={() => void completeTransfer(t.id)}>
                        완료
                      </button>
                      <button className="danger" type="button" onClick={() => void cancelTransfer(t.id)}>
                        취소
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!transferFilter.filtered.length && (
              <tr>
                <td colSpan={6}>
                  {transfers.length ? '필터 조건에 맞는 기록이 없습니다.' : '이전 기록이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>지갑 생성</h2>
              <button className="secondary modal-close" type="button" onClick={() => setCreateOpen(false)}>
                닫기
              </button>
            </div>
            <p className="modal-desc">새 TRC-20 키페어를 만들고 프라이빗 키를 암호화 저장합니다.</p>
            <form className="stack" onSubmit={createWallet}>
              <label>
                라벨
                <input name="label" defaultValue="관리자 지갑" required />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input name="makeDefault" type="checkbox" />
                OTC 기본 입금 지갑으로 설정
              </label>
              <div className="modal-actions">
                <button type="submit" disabled={busy}>
                  생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {registerOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>지갑 등록</h2>
              <button className="secondary modal-close" type="button" onClick={() => setRegisterOpen(false)}>
                닫기
              </button>
            </div>
            <p className="modal-desc">기존 TRC-20 주소를 등록합니다. 키가 있으면 함께 저장할 수 있습니다.</p>
            <form className="stack" onSubmit={registerWallet}>
              <label>
                라벨
                <input name="label" defaultValue="등록 지갑" required />
              </label>
              <label>
                주소
                <input name="address" required placeholder="T..." />
              </label>
              <label>
                프라이빗 키 (선택)
                <input name="privateKey" placeholder="hex" autoComplete="off" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input name="makeDefault" type="checkbox" />
                OTC 기본 입금 지갑으로 설정
              </label>
              <div className="modal-actions">
                <button type="submit" disabled={busy}>
                  등록
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** KST calendar day start as UTC Date. */
function kstDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

/** Exclusive end: day after ymd at 00:00 KST. */
function kstDayEndExclusive(ymd: string): Date {
  return new Date(kstDayStart(ymd).getTime() + 86400000);
}

function ymdKst(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Shift a KST ymd by ±days (calendar). */
function addDaysYmdKst(ymd: string, days: number): string {
  const base = kstDayStart(ymd);
  return ymdKst(new Date(base.getTime() + days * 86400000));
}

type QuickRangeKind = 'yesterday' | 'today' | 'thisWeek' | 'thisMonth';

/** Inclusive KST date range. Week = Mon → today; month = 1st → today. */
function quickRangeKst(kind: QuickRangeKind): { from: string; to: string } {
  const today = ymdKst();
  if (kind === 'today') return { from: today, to: today };
  if (kind === 'yesterday') {
    const y = addDaysYmdKst(today, -1);
    return { from: y, to: y };
  }
  if (kind === 'thisWeek') {
    const short = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      weekday: 'short',
    }).format(kstDayStart(today));
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wd = map[short] ?? 1;
    const mondayOffset = wd === 0 ? -6 : 1 - wd;
    return { from: addDaysYmdKst(today, mondayOffset), to: today };
  }
  const [y, m] = today.split('-');
  return { from: `${y}-${m}-01`, to: today };
}

export function AdminAgentFeesPage() {
  const [partners, setPartners] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState('');
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'name', label: '솔루션', get: (r) => String(r.name ?? '') },
      { key: 'code', label: '코드', get: (r) => String(r.code ?? '') },
      { key: 'agentLoginId', label: '에이전트', get: (r) => String(r.agentLoginId ?? '') },
      {
        key: 'parentName',
        label: '상부',
        get: (r) => (r.parentName ? `${r.parentName} (${r.parentCode})` : '관리자 직속'),
      },
      { key: 'feePercent', label: '수수료%', align: 'right', get: (r) => String(r.agentFeePercent ?? '') },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, partners);
  const feeCols = filterCols(fields, [
    'name',
    'code',
    'agentLoginId',
    'parentName',
    'feePercent',
    null,
  ]);
  async function load() {
    const d = await api<{ partners: any[] }>('/api/admin/partners');
    setPartners(d.partners);
    const next: Record<string, string> = {};
    for (const p of d.partners) next[p.id] = String(p.agentFeePercent ?? 0);
    setDrafts(next);
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);
  async function save(id: string) {
    setBusyId(id);
    setError('');
    setMsg('');
    try {
      const pct = Number(drafts[id]);
      const d = await api<{ partner: { agentFeePercent: number } }>(`/api/admin/partners/${id}/agent-fee`, {
        method: 'PATCH',
        json: { agentFeePercent: pct },
      });
      setMsg(`수수료 ${formatNum(d.partner.agentFeePercent)}% 저장됨`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusyId('');
    }
  }
  return (
    <div>
      <h1 className="page-title">에이전트 수수료</h1>
      <p className="page-sub">
        솔루션별 플랫폼 수수료(%). 에이전트 지급 = 구매 KRW × (1 − 수수료/100). 상부·하부는{' '}
        <a href="/admin/agent-tree">에이전트 트리</a>에서 지정합니다. 하부 수수료 풀에서 상부가 본인
        요율만큼 가져가고 나머지는 관리자 몫입니다.
      </p>
      {error && <p className="error">{error}</p>}
      {msg && (
        <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(var(--accent-rgb), 0.35)' }}>
          {msg}
        </p>
      )}
      <div className="panel table-scroll">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={feeCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={feeCols} />
            </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.code}</td>
                <td>{p.agentLoginId || '—'}</td>
                <td>
                  {p.parentName ? `${p.parentName} (${p.parentCode})` : '관리자 직속'}
                </td>
                <td className="col-amount" style={{ maxWidth: 120 }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={drafts[p.id] ?? '0'}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </td>
                <td>
                  <button type="button" disabled={busyId === p.id} onClick={() => void save(p.id)}>
                    저장
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6}>
                  {partners.length ? '필터 조건에 맞는 솔루션이 없습니다.' : '등록된 솔루션이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminAgentSettlementsPage() {
  const today = ymdKst();
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [fromYmd, setFromYmd] = useState(today);
  const [toYmd, setToYmd] = useState(today);
  const [quickKind, setQuickKind] = useState<QuickRangeKind | ''>('today');
  const [preview, setPreview] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const previewTrades = preview?.trades || [];
  const previewFields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'completedAt', label: '완료 시각', get: (r) => formatKst(r.completedAt) },
      { key: 'loginId', label: '아이디', get: (r) => String(r.loginId ?? '') },
      { key: 'amountKrw', label: 'KRW', align: 'right', get: (r) => String(r.amountKrw ?? '') },
    ],
    [],
  );
  const previewFilter = useMultiFilters(previewFields, previewTrades);
  const historyFields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'completedAt', label: '완료', get: (r) => formatKst(r.completedAt) },
      { key: 'partnerName', label: '솔루션', get: (r) => String(r.partnerName ?? '') },
      {
        key: 'period',
        label: '기간',
        get: (r) => periodRangeText(r.periodStart, r.periodEnd),
      },
      { key: 'grossKrw', label: '총입금', align: 'right', get: (r) => String(r.grossKrw ?? '') },
      { key: 'feePercent', label: '수수료%', align: 'right', get: (r) => String(r.feePercent ?? '') },
      { key: 'agentDueKrw', label: '지급액', align: 'right', get: (r) => String(r.agentDueKrw ?? '') },
      { key: 'agentLoginId', label: '에이전트', get: (r) => String(r.agentLoginId ?? '') },
    ],
    [],
  );
  const historyFilter = useMultiFilters(historyFields, history);
  const previewCols = filterCols(previewFields, ['completedAt', 'loginId', 'amountKrw']);
  const historyCols = filterCols(historyFields, [
    'completedAt',
    'partnerName',
    'period',
    'grossKrw',
    'feePercent',
    'agentDueKrw',
    'agentLoginId',
  ]);

  async function loadHistory(pid = partnerId) {
    const q = pid ? `?partnerId=${encodeURIComponent(pid)}` : '';
    const d = await api<{ settlements: any[] }>(`/api/admin/agent-settlements${q}`);
    setHistory(d.settlements);
  }

  useEffect(() => {
    void (async () => {
      try {
        const d = await api<{ partners: any[] }>('/api/admin/partners');
        setPartners(d.partners);
        if (d.partners[0]) setPartnerId(d.partners[0].id);
        await loadHistory('');
      } catch (e) {
        setError(e instanceof Error ? e.message : '로드 실패');
      }
    })();
  }, []);

  async function runPreview(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setPreview(null);
    if (!partnerId || !fromYmd || !toYmd) {
      setError('솔루션과 기간을 선택하세요.');
      return;
    }
    const from = kstDayStart(fromYmd);
    const to = kstDayEndExclusive(toYmd);
    if (!(to > from)) {
      setError('종료일은 시작일 이상이어야 합니다.');
      return;
    }
    setBusy(true);
    try {
      const d = await api<any>(
        `/api/admin/agent-settlements/preview?partnerId=${encodeURIComponent(partnerId)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
      setPreview(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : '미리보기 실패');
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!preview || !partnerId || !fromYmd || !toYmd) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const from = kstDayStart(fromYmd);
      const to = kstDayEndExclusive(toYmd);
      const d = await api<{ settlement: any }>('/api/admin/agent-settlements', {
        method: 'POST',
        json: {
          partnerId,
          from: from.toISOString(),
          to: to.toISOString(),
          note: 'admin settlement',
        },
      });
      setMsg(
        `정산 완료 · 지급 ${formatKrw(d.settlement.agentDueKrw)} KRW (${d.settlement.tradeCount ?? preview.tradeCount}건)`,
      );
      setPreview(null);
      await loadHistory(partnerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '정산 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">에이전트 정산</h1>
      <p className="page-sub">
        기간(한국시간 일자, 종료일 포함)의 미정산 OTC 구매 KRW를 집계해 에이전트 지급액을 확정합니다. 오프라인 지급 후 완료 처리하세요.
      </p>
      {error && <p className="error">{error}</p>}
      {msg && (
        <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(var(--accent-rgb), 0.35)' }}>
          {msg}
        </p>
      )}
      <div className="panel">
        <form className="row" onSubmit={runPreview} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label>
            솔루션
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            시작일 (KST)
            <input
              type="date"
              value={fromYmd}
              onChange={(e) => {
                setFromYmd(e.target.value);
                setQuickKind('');
              }}
              required
            />
          </label>
          <label>
            종료일 (KST)
            <input
              type="date"
              value={toYmd}
              onChange={(e) => {
                setToYmd(e.target.value);
                setQuickKind('');
              }}
              required
            />
          </label>
          <div className="date-quick-btns" role="group" aria-label="기간 빠른 선택">
            {(
              [
                ['yesterday', '어제'],
                ['today', '오늘'],
                ['thisWeek', '이번주'],
                ['thisMonth', '이번달'],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className={`secondary${quickKind === kind ? ' date-quick-active' : ''}`}
                onClick={() => {
                  const r = quickRangeKst(kind);
                  setFromYmd(r.from);
                  setToYmd(r.to);
                  setQuickKind(kind);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="submit" disabled={busy}>
            미리보기
          </button>
        </form>
      </div>
      {preview && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>미리보기</h3>
          <p className="setting-desc">
            {preview.partner?.name} · 수수료 {formatNum(preview.feePercent)}% · {preview.tradeCount}건
          </p>
          <div className="rate-grid">
            <div className="rate-card">
              <strong>총 입금 (KRW)</strong>
              <div className="rate-value" style={{ marginTop: '0.5rem' }}>
                <span className="rate-num">{formatKrw(preview.grossKrw)}</span>
              </div>
            </div>
            <div className="rate-card active">
              <strong>에이전트 지급</strong>
              <div className="rate-value" style={{ marginTop: '0.5rem' }}>
                <span className="rate-num">{formatKrw(preview.agentDueKrw)}</span>
                <span className="rate-unit">KRW</span>
              </div>
            </div>
            <div className="rate-card">
              <strong>관리자 수수료</strong>
              <div className="rate-value" style={{ marginTop: '0.5rem' }}>
                <span className="rate-num">{formatKrw(preview.adminFeeKrw ?? 0)}</span>
                <span className="rate-unit">KRW</span>
              </div>
            </div>
          </div>
          {!!preview.parentShares?.length && (
            <div style={{ marginTop: '0.75rem' }}>
              <strong>상부 차등</strong>
              <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem' }}>
                {preview.parentShares.map((s: any) => (
                  <li key={s.partnerId}>
                    {s.name} ({s.code}) · {formatNum(s.ratePercent)}% → {formatKrw(s.dueKrw)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            style={{ marginTop: '1rem' }}
            disabled={busy || !(preview.tradeCount > 0)}
            onClick={() => void complete()}
          >
            정산 완료
          </button>
          {preview.trades?.length > 0 && (
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <TableCount shown={previewFilter.shownCount} total={previewFilter.totalCount} />
              <table>
                <thead>
                  <ColumnFilterRow
                    columns={previewCols}
                    values={previewFilter.values}
                    onChange={previewFilter.setValue}
                  />
                  <TableHeaderRow columns={previewCols} />
                  </thead>
                <tbody>
                  {previewFilter.filtered.map((t: any) => (
                    <tr key={t.id}>
                      <td>{formatKst(t.completedAt)}</td>
                      <td>
                        {t.loginId ? (
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => openMemberWindow('admin', t.loginId)}
                          >
                            {t.loginId}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="col-amount">{formatKrw(t.amountKrw)}</td>
                    </tr>
                  ))}
                  {!previewFilter.filtered.length && (
                    <tr>
                      <td colSpan={3}>필터 조건에 맞는 거래가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className="panel table-scroll">
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>정산 이력</h3>
          <button className="secondary" type="button" onClick={() => void loadHistory(partnerId)}>
            새로고침
          </button>
        </div>
        <TableCount shown={historyFilter.shownCount} total={historyFilter.totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={historyCols}
              values={historyFilter.values}
              onChange={historyFilter.setValue}
            />
            <TableHeaderRow columns={historyCols} />
            </thead>
          <tbody>
            {historyFilter.filtered.map((s) => (
              <tr key={s.id}>
                <td>{formatKst(s.completedAt)}</td>
                <td>
                  {s.partnerName} ({s.partnerCode})
                </td>
                <td>
                  <PeriodRange start={s.periodStart} end={s.periodEnd} />
                </td>
                <td className="col-amount">{formatKrw(s.grossKrw)}</td>
                <td className="col-amount">{formatNum(s.feePercent)}</td>
                <td className="col-amount">{formatKrw(s.agentDueKrw)}</td>
                <td>{s.agentLoginId || '—'}</td>
              </tr>
            ))}
            {!historyFilter.filtered.length && (
              <tr>
                <td colSpan={7}>
                  {history.length ? '필터 조건에 맞는 이력이 없습니다.' : '이력이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
