// Notificações no iPhone (só na app instalada). Regista o aparelho e abre o aviso ao tocar.
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

let started = false;
let token: string | null = null;

export async function startPush(open: (route: string) => void) {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PushNotifications.addListener('registration', async (t) => {
      token = t.value;
      const { error } = await supabase.rpc('register_device', { p_token: t.value, p_platform: Capacitor.getPlatform(), p_environment: 'production' });
      if (error) console.error('register_device', error);
    });
    await PushNotifications.addListener('registrationError', (e) => console.error('push', e));
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const route = (a.notification.data as { rota?: string } | undefined)?.rota;
      if (route) open(route);
    });
    await PushNotifications.register();
  } catch (e) {
    console.error('push', e);
  }
}

/** Ao sair da conta: este aparelho deixa de receber avisos. */
export async function stopPush() {
  if (token) await supabase.rpc('forget_device', { p_token: token });
  token = null;
  started = false;
  try { if (Capacitor.isNativePlatform()) await PushNotifications.removeAllListeners(); } catch { /* */ }
}

/** Depois de criar um aviso: dispara a notificação para os destinatários. */
export async function pushNotice(noticeId: string): Promise<{ sent: number; devices: number } | null> {
  const { data, error } = await supabase.functions.invoke('notice-push', { body: { notice_id: noticeId } });
  if (error) { console.error('notice-push', error); return null; }
  return { sent: data?.sent ?? 0, devices: data?.devices ?? 0 };
}
