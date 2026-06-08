import type { TelegramWebhookPayload } from '@/lib/telegram';

export async function handleAskMessage(
  payload: TelegramWebhookPayload
): Promise<string> {
  void payload;
  return 'enrolment/ask';
}
