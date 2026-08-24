-- 018_login_id_case_insensitive.sql — store login ids lowercase; enforce uniqueness on lower(email)

UPDATE users SET email = lower(email) WHERE email <> lower(email);

-- Unique on lower(email) so mixed-case inserts cannot collide (belt-and-suspenders with app normalize)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (lower(email));

COMMENT ON COLUMN users.email IS 'Login id (plain text). Always stored lowercase; login is case-insensitive.';
