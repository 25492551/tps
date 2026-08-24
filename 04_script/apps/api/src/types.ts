export type UserRole = 'admin' | 'agent' | 'member';
export type UserStatus = 'pending_approval' | 'active' | 'suspended' | 'deleted' | 'rejected';

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  canBuyTether: boolean;
  canSellTether: boolean;
  createdAt: string;
  partnerId?: string | null;
  partnerCode?: string | null;
  partnerName?: string | null;
};

export type DbUser = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: UserRole | 'user';
  status: UserStatus;
  can_buy_tether?: boolean;
  can_sell_tether?: boolean;
  created_at: Date;
  updated_at: Date;
};

function normalizeRole(role: string): UserRole {
  if (role === 'admin' || role === 'agent' || role === 'member') return role;
  if (role === 'user') return 'member';
  return 'member';
}

export function toPublicUser(u: DbUser): PublicUser {
  const role = normalizeRole(u.role);
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role,
    status: u.status,
    canBuyTether: role === 'admin' ? true : u.can_buy_tether !== false,
    canSellTether: role === 'admin' ? true : u.can_sell_tether !== false,
    createdAt: u.created_at.toISOString(),
  };
}

/** End-user roles that trade on /app (not admin/agent portal). */
export function isMemberRole(role: string): boolean {
  return normalizeRole(role) === 'member';
}

export function isAgentRole(role: string): boolean {
  return normalizeRole(role) === 'agent';
}
