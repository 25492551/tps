import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

type CaptchaEntry = {
  answer: string;
  expiresAt: number;
};

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, CaptchaEntry>();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function cleanup() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

function randomCode(len = 5): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)]!;
  }
  return out;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Distorted SVG captcha image (no external deps). */
function buildSvg(code: string): string {
  const w = 160;
  const h = 52;
  const chars = [...code];
  const glyphs = chars
    .map((ch, i) => {
      const x = 18 + i * 28;
      const y = 34 + randomInt(-6, 7);
      const rot = randomInt(-22, 23);
      const size = 26 + randomInt(0, 5);
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-size="${size}" font-family="ui-monospace,monospace" font-weight="700" fill="#1a1a1a">${escapeXml(ch)}</text>`;
    })
    .join('');
  const noise: string[] = [];
  for (let i = 0; i < 6; i++) {
    const x1 = randomInt(0, w);
    const y1 = randomInt(0, h);
    const x2 = randomInt(0, w);
    const y2 = randomInt(0, h);
    noise.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8a8a8a" stroke-width="1" opacity="0.55"/>`,
    );
  }
  for (let i = 0; i < 28; i++) {
    noise.push(
      `<circle cx="${randomInt(0, w)}" cy="${randomInt(0, h)}" r="1" fill="#6b6b6b" opacity="0.45"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="captcha">
  <rect width="100%" height="100%" fill="#e8e8e8"/>
  ${noise.join('\n  ')}
  ${glyphs}
</svg>`;
}

export function issueCaptcha(): { id: string; imageSvg: string } {
  cleanup();
  const id = randomBytes(16).toString('hex');
  const answer = randomCode(5);
  store.set(id, { answer, expiresAt: Date.now() + TTL_MS });
  return { id, imageSvg: buildSvg(answer) };
}

/** One-time consume. Returns true if answer matches. */
export function consumeCaptcha(id: string, answer: string): boolean {
  cleanup();
  const entry = store.get(id);
  store.delete(id);
  if (!entry || entry.expiresAt <= Date.now()) return false;
  const expect = entry.answer.toUpperCase();
  const got = String(answer || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (expect.length !== got.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expect), Buffer.from(got));
  } catch {
    return false;
  }
}
