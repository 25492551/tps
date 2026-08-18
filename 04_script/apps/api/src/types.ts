export type UserRole = 'user' | 'admin';
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
};

export type DbUser = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  can_buy_tether?: boolean;
  can_sell_tether?: boolean;
  created_at: Date;
  updated_at: Date;
};

export function toPublicUser(u: DbUser): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    status: u.status,
    canBuyTether: u.role === 'admin' ? true : u.can_buy_tether !== false,
    canSellTether: u.role === 'admin' ? true : u.can_sell_tether !== false,
    createdAt: u.created_at.toISOString(),
  };
}
