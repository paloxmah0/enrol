import type { TelegramWebhookPayload } from '@/lib/telegram';

export async function handleRoleMessage(
  _payload: TelegramWebhookPayload
): Promise<string> {
  return 'enrolment/role';
}
