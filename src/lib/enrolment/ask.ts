import { fetchRagAnswer } from '@/lib/ask/client';
import { logger } from '@/lib/logger';
import type { TelegramWebhookPayload } from '@/lib/telegram';

const ASK_USAGE =
  'Send a question after /ask, for example: /ask How do I enrol a facilitator role?';

export type AskMessageOptions = {
  sendProcessingIndicator?: () => Promise<number>;
  deleteProcessingIndicator?: (messageId: number) => Promise<void>;
};

export function extractAskQuery(text: string): string | null {
  const query = text.replace(/^\/ask(?:@\S+)?(?:\s+|\s*$)/i, '').trim();
  return query || null;
}

export async function handleAskMessage(
  payload: TelegramWebhookPayload,
  options?: AskMessageOptions
): Promise<string> {
  const text = payload.message?.text?.trim();
  if (!text) {
    return ASK_USAGE;
  }

  const query = extractAskQuery(text);
  if (!query) {
    return ASK_USAGE;
  }

  let processingMessageId: number | undefined;

  try {
    if (options?.sendProcessingIndicator) {
      processingMessageId = await options.sendProcessingIndicator();
    }

    return await fetchRagAnswer(query);
  } catch (error) {
    logger.error('Failed to fetch RAG answer', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'Sorry, I could not answer that right now. Please try again later.';
  } finally {
    if (
      processingMessageId !== undefined &&
      options?.deleteProcessingIndicator
    ) {
      await options.deleteProcessingIndicator(processingMessageId);
    }
  }
}
