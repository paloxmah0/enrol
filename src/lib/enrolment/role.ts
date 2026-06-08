import type { TelegramWebhookPayload } from '@/lib/telegram';

export async function handleRoleMessage(
  payload: TelegramWebhookPayload
): Promise<null> {
  void payload;
  return null;
}
