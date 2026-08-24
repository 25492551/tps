/** Open member detail in a dedicated browser window (admin / agent). */
export function openMemberWindow(
  portal: 'admin' | 'agent',
  loginId: string,
  tab?: 'basic' | 'tx' | 'access',
) {
  const id = String(loginId || '').trim();
  if (!id) return;
  const base = portal === 'admin' ? '/admin/member' : '/agent/member';
  const q = tab && tab !== 'basic' ? `?tab=${tab}` : '';
  const url = `${base}/${encodeURIComponent(id)}${q}`;
  const name = `tps-member-${portal}-${id}`;

  const width = Math.min(1040, Math.max(480, (window.innerWidth || 1040) - 40));
  const height = Math.min(800, Math.max(420, (window.innerHeight || 800) - 40));
  // Position relative to the opener so the popup lands on the same monitor
  // (screenX/screenY can be negative on left-side displays — do not clamp to 0).
  const originX = window.screenX ?? window.screenLeft ?? 0;
  const originY = window.screenY ?? window.screenTop ?? 0;
  const left = Math.round(originX + ((window.innerWidth || width) - width) / 2);
  const top = Math.round(originY + Math.max(0, ((window.innerHeight || height) - height) / 2));

  window.open(
    url,
    name,
    `noopener,noreferrer,width=${width},height=${height},left=${left},top=${top}`,
  );
}
