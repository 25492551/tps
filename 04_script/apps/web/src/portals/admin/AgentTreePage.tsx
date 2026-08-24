import { useEffect, useMemo, useState } from 'react';
import { api, formatNum } from '../../lib/api';

type TreeNode = {
  id: string;
  code: string;
  name: string;
  status: string;
  agentLoginId: string | null;
  agentDisplayName: string | null;
  agentFeePercent: number;
  parentPartnerId: string | null;
};

type FlatRow = TreeNode & { depth: number; children: FlatRow[] };

function buildTree(nodes: TreeNode[]): FlatRow[] {
  const byParent = new Map<string | null, TreeNode[]>();
  for (const n of nodes) {
    const key = n.parentPartnerId;
    const list = byParent.get(key) || [];
    list.push(n);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code));
  }
  function walk(parentId: string | null, depth: number): FlatRow[] {
    const kids = byParent.get(parentId) || [];
    const out: FlatRow[] = [];
    for (const k of kids) {
      const row: FlatRow = { ...k, depth, children: [] };
      row.children = walk(k.id, depth + 1);
      out.push(row);
    }
    return out;
  }
  // Roots: parent null, or parent missing from set
  const ids = new Set(nodes.map((n) => n.id));
  const roots = nodes.filter((n) => !n.parentPartnerId || !ids.has(n.parentPartnerId));
  roots.sort((a, b) => a.code.localeCompare(b.code));
  const result: FlatRow[] = [];
  for (const r of roots) {
    const row: FlatRow = { ...r, depth: 0, children: walk(r.id, 1) };
    result.push(row);
  }
  return result;
}

function flatten(rows: FlatRow[]): FlatRow[] {
  const out: FlatRow[] = [];
  function visit(r: FlatRow) {
    out.push(r);
    r.children.forEach(visit);
  }
  rows.forEach(visit);
  return out;
}

export function AdminAgentTreePage() {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [allPartners, setAllPartners] = useState<any[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [parentDraft, setParentDraft] = useState('');
  const [feeDraft, setFeeDraft] = useState('');

  async function load() {
    const [t, p] = await Promise.all([
      api<{ nodes: TreeNode[] }>('/api/admin/partners/tree'),
      api<{ partners: any[] }>('/api/admin/partners'),
    ]);
    setNodes(t.nodes);
    setAllPartners(p.partners);
    setOpen((prev) => {
      const next = { ...prev };
      for (const n of t.nodes) {
        if (next[n.id] === undefined) next[n.id] = true;
      }
      return next;
    });
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : '로드 실패'));
  }, []);

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const flat = useMemo(() => flatten(tree), [tree]);
  const visible = useMemo(() => {
    const out: FlatRow[] = [];
    const collapsed = new Set<string>();
    for (const row of flat) {
      let hidden = false;
      let pid = row.parentPartnerId;
      while (pid) {
        if (collapsed.has(pid) || open[pid] === false) {
          hidden = true;
          break;
        }
        const parent = nodes.find((n) => n.id === pid);
        pid = parent?.parentPartnerId ?? null;
      }
      if (!hidden) out.push(row);
      if (open[row.id] === false) collapsed.add(row.id);
    }
    return out;
  }, [flat, open, nodes]);

  const selected = nodes.find((n) => n.id === selectedId) || null;

  useEffect(() => {
    if (!selected) return;
    setParentDraft(selected.parentPartnerId || '');
    setFeeDraft(String(selected.agentFeePercent ?? 0));
  }, [selectedId, selected?.parentPartnerId, selected?.agentFeePercent]);

  async function saveParent() {
    if (!selected) return;
    setBusyId(selected.id);
    setError('');
    setMsg('');
    try {
      await api(`/api/admin/partners/${selected.id}/parent`, {
        method: 'PATCH',
        json: { parentPartnerId: parentDraft || null },
      });
      setMsg('상부를 저장했습니다.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusyId('');
    }
  }

  async function saveFee() {
    if (!selected) return;
    setBusyId(selected.id);
    setError('');
    setMsg('');
    try {
      await api(`/api/admin/partners/${selected.id}/agent-fee`, {
        method: 'PATCH',
        json: { agentFeePercent: Number(feeDraft) },
      });
      setMsg('수수료를 저장했습니다.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusyId('');
    }
  }

  const parentOptions = allPartners.filter((p) => p.id !== selectedId);

  return (
    <div>
      <h1 className="page-title">에이전트 트리</h1>
      <p className="page-sub">
        솔루션(에이전트) 상부·하부를 지정합니다. 하부 수수료% ≥ 상부 수수료%. 하부 실적의 수수료 풀에서
        상부가 본인 요율만큼 가져가고, 나머지는 관리자 몫입니다.
      </p>
      {error && <p className="error">{error}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
      <div className="agent-tree-layout">
        <div className="panel agent-tree-pane">
          <div className="agent-tree-hq">관리자 (본사)</div>
          {visible.map((row) => {
            const hasKids = row.children.length > 0;
            const isOpen = open[row.id] !== false;
            return (
              <button
                key={row.id}
                type="button"
                className={`agent-tree-row${selectedId === row.id ? ' active' : ''}`}
                style={{ paddingLeft: `${12 + row.depth * 16}px` }}
                onClick={() => setSelectedId(row.id)}
              >
                {hasKids ? (
                  <span
                    className="agent-tree-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen((p) => ({ ...p, [row.id]: !isOpen }));
                    }}
                  >
                    {isOpen ? '▾' : '▸'}
                  </span>
                ) : (
                  <span className="agent-tree-toggle muted">·</span>
                )}
                <span className="agent-tree-label">
                  {row.name} <span className="muted">({row.code})</span>
                </span>
                <span className="agent-tree-meta">
                  {row.agentLoginId || '에이전트 없음'} · {formatNum(row.agentFeePercent)}%
                </span>
              </button>
            );
          })}
          {!visible.length && <p className="page-sub">등록된 솔루션이 없습니다.</p>}
        </div>
        <div className="panel">
          <h2 className="member-section-title">선택 솔루션</h2>
          {!selected && <p className="page-sub">트리에서 솔루션을 선택하세요.</p>}
          {selected && (
            <div className="stack">
              <p>
                <strong>{selected.name}</strong> ({selected.code})
              </p>
              <p className="setting-desc">에이전트: {selected.agentLoginId || '—'}</p>
              <label>
                상부 솔루션
                <select value={parentDraft} onChange={(e) => setParentDraft(e.target.value)}>
                  <option value="">— 관리자 직속 —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) · {formatNum(p.agentFeePercent)}%
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={busyId === selected.id} onClick={() => void saveParent()}>
                상부 저장
              </button>
              <label>
                수수료 %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={feeDraft}
                  onChange={(e) => setFeeDraft(e.target.value)}
                />
              </label>
              <button type="button" disabled={busyId === selected.id} onClick={() => void saveFee()}>
                수수료 저장
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
