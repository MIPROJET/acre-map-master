// AcreMap — Feedback (audio + vibration) & local notifications
// Fort, audible en plein soleil sur le terrain.

let _audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_audioCtx) return _audioCtx;
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  _audioCtx = new Ctor();
  return _audioCtx;
}

/** Réveille / débloque l'AudioContext suite à un geste utilisateur. */
export async function unlockAudio(): Promise<void> {
  const c = ctx();
  if (c && c.state === "suspended") {
    try { await c.resume(); } catch {}
  }
}

/**
 * Bip très fort multi-oscillateurs (sonne fort en extérieur).
 * - 3 oscillateurs (880, 1320, 660 Hz) en parallèle
 * - gain max 1.0 (volume système au max)
 * - durée 380 ms
 */
export function loudBeep(opts: { repeat?: number } = {}): void {
  const c = ctx();
  if (!c) return;
  const repeat = Math.max(1, opts.repeat ?? 1);
  for (let r = 0; r < repeat; r++) {
    const start = c.currentTime + r * 0.45;
    const freqs = [880, 1320, 660];
    for (const f of freqs) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(f, start);
      // Enveloppe ADSR très courte mais maximale
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(1.0, start + 0.01);
      g.gain.setValueAtTime(1.0, start + 0.30);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
      o.connect(g);
      g.connect(c.destination);
      o.start(start);
      o.stop(start + 0.4);
    }
  }
}

/** Bip court de confirmation (action utilisateur). */
export function shortBeep(): void {
  loudBeep({ repeat: 1 });
}

/** Bip d'alerte (3 bips) — auto-marquage, validation… */
export function alertBeep(): void {
  loudBeep({ repeat: 3 });
}

/** Vibration forte. Pattern long et appuyé. */
export function strongVibrate(pattern: number | number[] = [200, 80, 200, 80, 400]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

/** Combinaison son + vibration (auto-marquage 100m, point capté…). */
export function feedbackMark(): void {
  loudBeep({ repeat: 2 });
  strongVibrate([300, 100, 300]);
}

export function feedbackError(): void {
  loudBeep({ repeat: 1 });
  strongVibrate([500]);
}

export function feedbackSuccess(): void {
  loudBeep({ repeat: 1 });
  strongVibrate([100, 50, 100]);
}

// ================== Notifications =====================

export type NotifPermission = "granted" | "denied" | "default" | "unsupported";

export function notificationPermission(): NotifPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifPermission;
}

export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission as NotifPermission;
  }
  const r = await Notification.requestPermission();
  return r as NotifPermission;
}

/**
 * Notification locale forte. Si un Service Worker est enregistré, utilise
 * showNotification (persiste, visible même app fermée). Sinon, fallback
 * sur Notification(). Toujours accompagnée son+vibration.
 */
export async function notify(
  title: string,
  body: string,
  opts: { tag?: string; silent?: boolean; data?: unknown } = {}
): Promise<void> {
  // Toujours déclencher feedback local (in-app)
  if (!opts.silent) feedbackMark();

  const perm = notificationPermission();
  if (perm !== "granted") return;

  const options: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: opts.tag,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 500],
    data: opts.data,
    silent: false,
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
  } catch {
    // ignore
  }
}
