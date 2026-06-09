import { defaultCallbackUrl, dispatchRagRequest } from '@/lib/ask/client';
import type { RagQuestionMetadata } from '@/lib/ask/types';
import { ENROLMENT_TOPIC } from '@/lib/enrolment/resolve/registry';
import { logger } from '@/lib/logger';
import type { TelegramWebhookPayload } from '@/lib/telegram';

const ASK_USAGE =
  'Send a question after /ask, for example: /ask How do I enrol a facilitator role?';

export function isAskText(text: string | null | undefined): boolean {
  if (!text?.trim()) {
    return false;
  }

  return /^\/ask(?:@\S+)?/i.test(text.trim());
}

export type AskMessageOptions = {
  sendProcessingIndicator?: () => Promise<number>;
};

export function extractAskQuery(text: string): string | null {
  const query = text.replace(/^\/ask(?:@\S+)?(?:\s+|\s*$)/i, '').trim();
  return query || null;
}

export function ragMetadataFromPayload(
  payload: TelegramWebhookPayload,
  processingMessageId: number,
): RagQuestionMetadata | null {
  const chatId = payload.message?.chat?.id;
  if (chatId == null) return null;

  return {
    telegramChat: chatId,
    topic: ENROLMENT_TOPIC,
    processingMessageId,
    messageThreadId: payload.message?.message_thread_id,
    callbackUrl: defaultCallbackUrl(),
  };
}

export async function handleAskMessage(
  payload: TelegramWebhookPayload,
  options?: AskMessageOptions,
): Promise<string | null> {
  const text = payload.message?.text?.trim();
  if (!text) {
    return ASK_USAGE;
  }

  const query = extractAskQuery(text);
  if (!query) {
    return ASK_USAGE;
  }

  if (!options?.sendProcessingIndicator) {
    return 'Sorry, I could not answer that right now. Please try again later.';
  }

  try {
    const processingMessageId = await options.sendProcessingIndicator();
    const metadata = ragMetadataFromPayload(payload, processingMessageId);
    if (!metadata) {
      return 'Sorry, I could not answer that right now. Please try again later.';
    }

    await dispatchRagRequest(query, metadata);
    return null;
  } catch (error) {
    logger.error('Failed to dispatch RAG request', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'Sorry, I could not answer that right now. Please try again later.';
  }
}
