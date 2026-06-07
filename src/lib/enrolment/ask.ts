import type { TelegramWebhookPayload } from '@/lib/telegram';

export async function handleAskMessage(
  _payload: TelegramWebhookPayload
): Promise<string> {
  return 'enrolment/ask';
}
