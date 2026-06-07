import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { loadEntryTelegramRef } from './neo4j';

/** Matches timelining organisingQueueKey('enrol'). */
export const ORGANISING_ENROL_QUEUE = 'timelining::organising::enrol';

type TelegramQueuePayload = {
  message?: {
    message_id?: number;
    chat?: { id?: number };
  };
};

function payloadMatchesRef(
  serialized: string,
  messageId: number,
  chatId: number
): boolean {
  try {
    const payload = JSON.parse(serialized) as TelegramQueuePayload;
    return (
      payload.message?.message_id === messageId &&
      payload.message?.chat?.id === chatId
    );
  } catch {
    return false;
  }
}

/** Remove the organising queue item for a resolved entry. */
export async function removeFromOrganisingQueue(entryId: string): Promise<boolean> {
  const ref = await loadEntryTelegramRef(entryId);
  if (!ref) {
    logger.warn('Organising queue cleanup skipped: no telegram ref', { entryId });
    return false;
  }

  const items = await redis.lrange<string>(ORGANISING_ENROL_QUEUE, 0, -1);
  if (!items || items.length === 0) {
    logger.info('Organising queue empty during cleanup', { entryId });
    return false;
  }

  for (const item of items) {
    const serialized = typeof item === 'string' ? item : JSON.stringify(item);
    if (!payloadMatchesRef(serialized, ref.messageId, ref.chatId)) {
      continue;
    }

    const removed = await redis.lrem(ORGANISING_ENROL_QUEUE, 1, serialized);
    logger.info('Removed entry from organising queue', {
      entryId,
      messageId: ref.messageId,
      chatId: ref.chatId,
      removed,
    });
    return removed > 0;
  }

  logger.warn('Organising queue item not found for entry', {
    entryId,
    messageId: ref.messageId,
    chatId: ref.chatId,
  });
  return false;
}
