-- 015_login_id_plain_text.sql — users.email holds plain login id (not email)

-- Prefer partner solution login id when mapped
UPDATE users u
SET email = lower(trim(pm.external_login_id)),
    updated_at = now()
FROM partner_members pm
WHERE pm.user_id = u.id
  AND length(trim(pm.external_login_id)) > 0
  AND (u.email LIKE '%@%' OR u.email <> lower(trim(pm.external_login_id)));

-- Remaining accounts: drop @ and domain
UPDATE users
SET email = lower(split_part(email, '@', 1)),
    updated_at = now()
WHERE position('@' in email) > 0;

-- Empty after strip → stable fallback
UPDATE users
SET email = 'user_' || substr(replace(id::text, '-', ''), 1, 12),
    updated_at = now()
WHERE email IS NULL OR trim(email) = '';

-- Deduplicate collisions (keep oldest; suffix others)
WITH ranked AS (
  SELECT
    id,
    email,
    row_number() OVER (PARTITION BY lower(email) ORDER BY created_at ASC, id ASC) AS rn
  FROM users
)
UPDATE users u
SET email = lower(u.email) || '_' || substr(replace(u.id::text, '-', ''), 1, 6),
    updated_at = now()
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;
