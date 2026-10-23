// Deteta se estamos dentro da app (iPhone/Android, via Capacitor).
// Para experimentar a interface da app no browser: abrir o site com ?app=1 (e ?app=0 para voltar).
import { Capacitor } from '@capacitor/core';

export function isApp(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('app');
    if (q === '1') localStorage.setItem('bn_app_mode', '1');
    if (q === '0') localStorage.removeItem('bn_app_mode');
  } catch { /* */ }
  if (Capacitor.isNativePlatform()) return true;
  try { return localStorage.getItem('bn_app_mode') === '1'; } catch { return false; }
}

// Dia de trabalho em Lisboa: antes das 09:00 ainda conta como o dia anterior.
export function businessDateLisbon(d = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(d).map((p) => [p.type, p.value]));
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  if (Number(parts.hour) % 24 >= 9) return iso;
  const x = new Date(iso + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
}
