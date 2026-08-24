/** Login id: plain text (not email). Stored lowercase in users.email; login is case-insensitive. */

const LOGIN_ID_RE = /^[a-z0-9._+-]{1,80}$/;

export function normalizeLoginId(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidLoginId(raw: string): boolean {
  const id = normalizeLoginId(raw);
  return LOGIN_ID_RE.test(id) && !id.includes('@');
}

/** Strip domain / reject email-shaped input for new writes. */
export function assertLoginId(raw: string): string {
  const id = normalizeLoginId(raw);
  if (!isValidLoginId(id)) {
    throw new Error('아이디는 영문·숫자·._+- 1~80자이며 이메일 형식을 사용할 수 없습니다');
  }
  return id;
}
