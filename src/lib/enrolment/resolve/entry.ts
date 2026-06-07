import { logger } from '@/lib/logger';
import {
  loadResolveContext,
  markEntryResolveFailed,
  markEntryResolveSuccessful,
} from './neo4j';
import { resolveRoleEntry } from './schema/resolveRole';
import type { EntryResolveResult } from './types';

export async function runEntryResolve(entryId: string): Promise<EntryResolveResult> {
  const ctx = await loadResolveContext(entryId);

  if (!ctx) {
    const reason = 'resolve_context_unavailable';
    await markEntryResolveFailed(entryId, reason);
    logger.error('Resolve failed: could not load context', { entryId, reason });
    return { entryId, resolveStatus: 'failed' };
  }

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
