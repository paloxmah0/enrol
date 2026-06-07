import { logger } from '@/lib/logger';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_TIMEOUT = 5000;

type SendMessageOptions = {
  message_thread_id?: number;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
};

export type TelegramWebhookPayload = {
  update_id?: number;
  message?: {
    message_id?: number;
    message_thread_id?: number;
    text?: string;
    voice?: { file_id: string };
    audio?: { file_id: string };
    chat?: {
      id: number;
      type?: string;
      is_forum?: boolean;
    };
    reply_to_message?: {
      forum_topic_created?: {
        name?: string;
      };
    };
  };
};

export function topicFromWebhookPayload(
  payload: TelegramWebhookPayload
): string | undefined {
  return payload.message?.reply_to_message?.forum_topic_created?.name;
}

export function messageThreadIdFromWebhookPayload(
  payload: TelegramWebhookPayload
): number | undefined {
  return payload.message?.message_thread_id;
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options: SendMessageOptions = {}
): Promise<{ message_id: number }> {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...options,
        }),
        signal: controller.signal,
      }
    );

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.description ?? 'Telegram API request failed');
    }

    return data.result;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('Telegram API timeout', { chatId });
      throw new Error('Telegram API timeout');
    }
    logger.error('Failed to send Telegram message', {
      chatId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to send Telegram message');
  } finally {
    clearTimeout(timeout);
  }
}
