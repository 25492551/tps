-- 017_agent_member_roles.sql — roles admin|agent|member; one agent per partner

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users SET role = 'member' WHERE role = 'user';

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'agent', 'member'));

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS agent_user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN partners.agent_user_id IS 'At most one agent account per solution (partner)';
