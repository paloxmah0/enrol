import type { TelegramWebhookPayload } from '@/lib/telegram';

export async function handleRoleMessage(
  payload: TelegramWebhookPayload
): Promise<string> {
  void payload;
  return 'Thanks — your enrolment voice note is being processed.';
}
