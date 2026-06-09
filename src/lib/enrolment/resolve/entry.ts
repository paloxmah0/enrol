import { logger } from '@/lib/logger';
import { evaluateResolveEligibility } from './eligibility';
import {
  loadEntryResolveRecord,
  markEntryResolveFailed,
  markEntryResolveSuccessful,
} from './neo4j';
import { handlerForTopic } from './registry';
import { resolveRoleEntry } from './schema/resolveRole';
import type { EntryResolveResult, ResolveContext } from './types';

export async function runEntryResolve(entryId: string): Promise<EntryResolveResult> {
  const record = await loadEntryResolveRecord(entryId);

  if (!record) {
    logger.info('Resolve skipped: entry not found', { entryId });
    return { entryId, status: 'skipped', reason: 'entry_not_found' };
  }

  const handler = handlerForTopic(record.topic ?? undefined);
  if (!handler) {
    logger.info('Resolve skipped: unsupported topic', { entryId, topic: record.topic });
    return { entryId, status: 'skipped', reason: 'unsupported_topic' };
  }

  const eligibility = evaluateResolveEligibility(record);
  if (eligibility.status === 'skipped') {
    logger.info('Resolve skipped', { entryId, reason: eligibility.reason });
    return { entryId, status: 'skipped', reason: eligibility.reason };
  }

  const ctx: ResolveContext = {
    entryId: record.entryId,
    topic: record.topic ?? '',
    handler,
    participantHandle: record.participantHandle,
    textContent: record.textContent,
    transcription: record.transcription,
  };

  logger.info('Resolve entry started', { entryId, handler: ctx.handler, topic: ctx.topic });

  try {
    await resolveRoleEntry(ctx);
    await markEntryResolveSuccessful(entryId);
    logger.info('Resolve entry successful', { entryId, handler: ctx.handler });
    return { entryId, handler: ctx.handler, resolveStatus: 'successful' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    await markEntryResolveFailed(entryId, message);
    logger.error('Resolve entry failed', {
      entryId,
      handler: ctx.handler,
      error: message,
    });
    return { entryId, handler: ctx.handler, resolveStatus: 'failed' };
  }
}
