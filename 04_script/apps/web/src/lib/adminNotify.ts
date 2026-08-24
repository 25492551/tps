/** Admin OTC pending-alert prefs (per browser; site settings tab). */

export const ADMIN_NOTIFY_SOUND_IDS = ['soft', 'chime', 'alert', 'urgent'] as const;
export type AdminNotifySoundId = (typeof ADMIN_NOTIFY_SOUND_IDS)[number];

export type AdminNotifyPrefs = {
  enabled: boolean;
  soundId: AdminNotifySoundId;
  /** How many times to play the pattern when a new hold arrives (1–10). */
  repeatCount: number;
  /** Playback volume 0–100. */
  volume: number;
};

const STORAGE_KEY = 'tps_admin_notify_prefs';

export const ADMIN_NOTIFY_SOUND_LABELS: Record<AdminNotifySoundId, string> = {
  soft: '부드러운 비프',
  chime: '차임 (기본)',
  alert: '알림',
  urgent: '긴급',
};

export const DEFAULT_ADMIN_NOTIFY_PREFS: AdminNotifyPrefs = {
  enabled: true,
  soundId: 'chime',
  repeatCount: 2,
  volume: 70,
};

function clampVolume(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ADMIN_NOTIFY_PREFS.volume;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function loadAdminNotifyPrefs(): AdminNotifyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ADMIN_NOTIFY_PREFS };
    const parsed = JSON.parse(raw) as Partial<AdminNotifyPrefs>;
    const soundId = ADMIN_NOTIFY_SOUND_IDS.includes(parsed.soundId as AdminNotifySoundId)
      ? (parsed.soundId as AdminNotifySoundId)
      : DEFAULT_ADMIN_NOTIFY_PREFS.soundId;
    const repeat = Number(parsed.repeatCount);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
      soundId,
      repeatCount: Number.isFinite(repeat) ? Math.min(10, Math.max(1, Math.round(repeat))) : 2,
      volume: clampVolume(Number(parsed.volume ?? DEFAULT_ADMIN_NOTIFY_PREFS.volume)),
    };
  } catch {
    return { ...DEFAULT_ADMIN_NOTIFY_PREFS };
  }
}

export function saveAdminNotifyPrefs(prefs: AdminNotifyPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent('tps-admin-notify-prefs'));
}

let audioCtx: AudioContext | null = null;

export function unlockAdminNotifyAudio() {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') void ctx.resume();
}

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AC();
  }
  return audioCtx;
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  gainPeak: number,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const peak = Math.max(0.0001, gainPeak);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function schedulePattern(
  ctx: AudioContext,
  soundId: AdminNotifySoundId,
  at: number,
  volScale: number,
): number {
  const s = volScale;
  switch (soundId) {
    case 'soft':
      tone(ctx, 660, at, 0.22, 'sine', 0.12 * s);
      return 0.35;
    case 'chime':
      tone(ctx, 784, at, 0.18, 'sine', 0.14 * s);
      tone(ctx, 1046, at + 0.16, 0.28, 'sine', 0.12 * s);
      return 0.55;
    case 'alert':
      tone(ctx, 880, at, 0.12, 'square', 0.08 * s);
      tone(ctx, 880, at + 0.18, 0.12, 'square', 0.08 * s);
      return 0.45;
    case 'urgent':
      tone(ctx, 988, at, 0.1, 'sawtooth', 0.07 * s);
      tone(ctx, 740, at + 0.12, 0.1, 'sawtooth', 0.07 * s);
      tone(ctx, 988, at + 0.24, 0.14, 'sawtooth', 0.08 * s);
      return 0.5;
    default:
      return 0.4;
  }
}

/** Play configured alert pattern `repeatCount` times. Returns false if disabled / blocked. */
export async function playAdminNotifyAlert(prefs?: AdminNotifyPrefs): Promise<boolean> {
  const p = prefs ?? loadAdminNotifyPrefs();
  if (!p.enabled) return false;
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  const volScale = clampVolume(p.volume) / 100;
  if (volScale <= 0) return true;
  let t = ctx.currentTime + 0.02;
  const n = Math.min(10, Math.max(1, p.repeatCount));
  for (let i = 0; i < n; i++) {
    t += schedulePattern(ctx, p.soundId, t, volScale) + 0.12;
  }
  return true;
}
