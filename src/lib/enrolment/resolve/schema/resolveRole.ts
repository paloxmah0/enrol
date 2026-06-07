import { fetchProtocolChannel } from '@/lib/docs/client';
import type { ResolveContext, SchemaResolveResult } from '../types';
import { extractRoleSnapshotFields } from './extract';
import { getEntrySourceText } from './entryText';
import { persistRoleGraph } from './persistRole';

async function resolveFromEntry(ctx: ResolveContext): Promise<SchemaResolveResult> {
  const channel = ctx.handler;
  const protocol = await fetchProtocolChannel(channel);

  const { text: sourceText, sourceKind } = getEntrySourceText(ctx);
  const extractedByNode = await extractRoleSnapshotFields(protocol, sourceText);

  return {
    protocol,
    schemaChannel: channel,
    extractedByNode,
    sourceText,
    sourceKind,
  };
}

/** Extract role_snapshot fields and persist the enrolment graph. */
export async function resolveRoleEntry(ctx: ResolveContext): Promise<void> {
  const result = await resolveFromEntry(ctx);
  await persistRoleGraph(ctx, result);
}
