import type { TelegramWebhookPayload } from '@/lib/telegram';

export async function handleRoleMessage(
  _payload: TelegramWebhookPayload
): Promise<string> {
  return 'Thanks — your enrolment voice note is being processed.';
}
