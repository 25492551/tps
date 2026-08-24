import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatKst, statusBadge } from '../../lib/api';
import { ColumnFilterRow, TableCount, filterCols, useMultiFilters, type FilterFieldDef } from '../../lib/tableFilters';

type SolutionKey = {
  id: string;
  code: string;
  name: string;
  status: string;
  keyIssued: boolean;
  publicKey: string;
  privateKey: string;
  keyPrefix: string;
  keyIssuedAt: string | null;
  callbackBaseUrl: string;
  virtualDepositAddress: string;
  createdAt?: string;
};

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function KeyCell({ value, emptyHint, copyLabel }: { value: string; emptyHint: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return <span className="setting-desc">{emptyHint}</span>;
  }
  return (
    <div className="key-cell">
      <code className="key-cell-value">{value}</code>
      <button
        type="button"
        className="secondary"
        aria-label={`${copyLabel} 복사`}
        onClick={() => {
          void copyText(value)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined);
        }}
      >
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}

export function AdminSolutionKeysPage() {
  const [rows, setRows] = useState<SolutionKey[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busyId, setBusyId] = useState('');
  const [creating, setCreating] = useState(false);

  const fields = useMemo<FilterFieldDef<SolutionKey>[]>(
    () => [
      { key: 'code', label: '코드', get: (r) => String(r.code ?? '') },
      { key: 'name', label: '솔루션', get: (r) => String(r.name ?? '') },
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: [
          { value: 'active', label: '활성' },
          { value: 'disabled', label: '비활성' },
        ],
        get: (r) => String(r.status ?? ''),
      },
      { key: 'publicKey', label: '공개키', get: (r) => String(r.publicKey ?? '') },
      { key: 'privateKey', label: '개인키', get: (r) => String(r.privateKey ?? '') },
      {
        key: 'keyIssuedAt',
        label: '발급 시각',
        get: (r) => (r.keyIssuedAt ? formatKst(r.keyIssuedAt) : ''),
      },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, rows);

  async function load() {
    const d = await api<{ solutions: SolutionKey[] }>('/api/admin/solution-keys');
    setRows(d.solutions || []);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : '불러오기 실패'));
  }, []);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const code = String(fd.get('code') || '').trim();
    const name = String(fd.get('name') || '').trim();
    const callbackBaseUrl = String(fd.get('callbackBaseUrl') || '').trim();
    setCreating(true);
    setError('');
    setOk('');
    try {
      await api('/api/admin/solution-keys', {
        method: 'POST',
        json: { code, name, callbackBaseUrl },
      });
      setOk(`${code.toLowerCase()} 솔루션을 등록했습니다. 이제 API 키를 발급하세요.`);
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setCreating(false);
    }
  }

  async function issue(id: string, code: string) {
    const msg = rows.find((r) => r.id === id)?.keyIssued
      ? `${code} 키를 재발급할까요? 기존 공개키·개인키는 즉시 무효가 됩니다.`
      : `${code} 솔루션 공개키·개인키를 발급할까요?`;
    if (!window.confirm(msg)) return;
    setBusyId(id);
    setError('');
    setOk('');
    try {
      const d = await api<{ warning?: string }>(`/api/admin/solution-keys/${id}/issue`, { method: 'POST' });
      setOk(d.warning || '공개키·개인키가 발급되었습니다.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '발급 실패');
    } finally {
      setBusyId('');
    }
  }

  async function revoke(id: string, code: string) {
    if (!window.confirm(`${code} API 키를 회수할까요? 해당 솔루션은 Partner API에 접속할 수 없습니다.`)) {
      return;
    }
    setBusyId(id);
    setError('');
    setOk('');
    try {
      await api(`/api/admin/solution-keys/${id}/revoke`, { method: 'POST' });
      setOk(`${code} 키를 회수했습니다.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '회수 실패');
    } finally {
      setBusyId('');
    }
  }

  async function setStatus(id: string, status: 'active' | 'disabled') {
    setBusyId(id);
    setError('');
    try {
      await api(`/api/admin/solution-keys/${id}`, {
        method: 'PATCH',
        json: { status },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '상태 변경 실패');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <h1 className="page-title">API 키 관리</h1>
      <p className="page-sub">
        솔루션별 <strong>공개키</strong>·<strong>개인키</strong>입니다. Partner API 요청 헤더{' '}
        <code>X-Partner-Key</code> / <code>Authorization: Bearer</code>에는 <strong>개인키</strong>를 넣습니다
        (솔루션 <code>TPS_PARTNER_KEY</code>).{' '}
        <Link to="/admin/api-guide">API 안내</Link>
      </p>
      {error && <p className="error">{error}</p>}
      {ok && <p className="setting-desc">{ok}</p>}

      <div className="panel">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          솔루션 등록
        </h2>
        <p className="setting-desc">
          새 솔루션을 등록한 뒤 <strong>발급</strong>을 눌러 공개키·개인키를 만듭니다. 코드는 소문자로 저장됩니다.
        </p>
        <form className="stack" onSubmit={(e) => void create(e)}>
          <div className="row">
            <label>
              코드
              <input
                name="code"
                required
                autoComplete="off"
                placeholder="s02"
                pattern="[A-Za-z0-9][A-Za-z0-9_\-]{0,31}"
                title="영문·숫자로 시작, 하이픈·밑줄 가능 (최대 32자)"
              />
            </label>
            <label>
              이름
              <input name="name" required autoComplete="off" placeholder="S02 Game" />
            </label>
            <label style={{ flex: 1, minWidth: 220 }}>
              콜백 URL
              <input name="callbackBaseUrl" type="url" placeholder="https://partner.example.com" />
            </label>
          </div>
          <button type="submit" disabled={creating}>
            {creating ? '등록 중…' : '등록'}
          </button>
        </form>
      </div>

      <div className="panel table-scroll">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={filterCols(fields, [
                'code',
                'name',
                'status',
                'publicKey',
                'privateKey',
                'keyIssuedAt',
                null,
              ])}
              values={values}
              onChange={setValue}
            />
          <tr>
              <th>코드</th>
              <th>이름</th>
              <th>상태</th>
              <th>공개키</th>
              <th>개인키</th>
              <th>발급 시각</th>
              <th>액션</th>
            </tr>
            </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <code>{r.code}</code>
                </td>
                <td>{r.name}</td>
                <td>
                  <span className={`badge ${statusBadge(r.status)}`}>
                    {r.status === 'active' ? '활성' : '비활성'}
                  </span>
                </td>
                <td>
                  {r.keyIssued ? (
                    <KeyCell copyLabel="공개키" value={r.publicKey} emptyHint="재발급하면 표시됩니다" />
                  ) : (
                    <span className="badge danger">미발급</span>
                  )}
                </td>
                <td>
                  {r.keyIssued ? (
                    <KeyCell
                      copyLabel="개인키"
                      value={r.privateKey}
                      emptyHint="예전 키는 복원할 수 없습니다. 재발급하면 표시됩니다."
                    />
                  ) : (
                    <span className="badge danger">미발급</span>
                  )}
                </td>
                <td>{r.keyIssuedAt ? formatKst(r.keyIssuedAt) : '—'}</td>
                <td className="actions-cell">
                  <div className="table-actions">
                    <button type="button" disabled={busyId === r.id} onClick={() => void issue(r.id, r.code)}>
                      {r.keyIssued ? '재발급' : '발급'}
                    </button>
                    {r.keyIssued && (
                      <button
                        type="button"
                        className="danger"
                        disabled={busyId === r.id}
                        onClick={() => void revoke(r.id, r.code)}
                      >
                        회수
                      </button>
                    )}
                    {r.status === 'active' ? (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyId === r.id}
                        onClick={() => void setStatus(r.id, 'disabled')}
                      >
                        비활성
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyId === r.id}
                        onClick={() => void setStatus(r.id, 'active')}
                      >
                        활성
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  {rows.length ? '필터 조건에 맞는 솔루션이 없습니다.' : '등록된 솔루션이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
