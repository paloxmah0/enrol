import { logger } from '@/lib/logger';
import { runEntryResolve } from './entry';
import {
  countEntriesPendingResolve,
  countResolveStatusByStatus,
  markEntryResolveAttempted,
  pickEntriesPendingResolve,
} from './neo4j';
import type { BacklogResolveResult } from './types';

export async function runBacklogResolveTick(): Promise<BacklogResolveResult> {
  const [outstanding, counts] = await Promise.all([
    countEntriesPendingResolve(),
    countResolveStatusByStatus(),
  ]);

  if (outstanding === 0) {
    logger.info('Backlog resolve: no pending _botEnrolment entries');
    return { status: 'idle', outstanding: 0, hasMore: false, counts };
  }

  const candidates = await pickEntriesPendingResolve(1);
  const entryId = candidates[0];
  if (!entryId) {
    return { status: 'idle', outstanding: 0, hasMore: false, counts };
  }

  const marked = await markEntryResolveAttempted(entryId);
  if (!marked) {
    const remaining = await countEntriesPendingResolve();
    logger.warn('Backlog resolve skipped entry (not pending)', { entryId, remaining });
    return {
      status: 'idle',
      outstanding: remaining,
      hasMore: remaining > 0,
      counts: await countResolveStatusByStatus(),
    };
  }

  logger.info('Backlog resolve processing entry', { entryId, outstanding });

  const result = await runEntryResolve(entryId);

  const [remaining, updatedCounts] = await Promise.all([
    countEntriesPendingResolve(),
    countResolveStatusByStatus(),
  ]);

  logger.info('Backlog resolve tick complete', {
    entryId,
    outcome:
      'resolveStatus' in result
        ? { resolveStatus: result.resolveStatus }
        : { status: 'skipped', reason: result.reason },
    remaining,
  });

  return {
    status: 'success',
    entryId,
    result,
    outstanding: remaining,
    hasMore: remaining > 0,
    counts: updatedCounts,
  };
}
