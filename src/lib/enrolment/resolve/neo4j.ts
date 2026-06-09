import { initDriver } from '@/lib/db/neo4j';
import neo4j from 'neo4j-driver';
import type { EntryResolveRecord } from './eligibility';
import { evaluateResolveEligibility } from './eligibility';
import { ENROLMENT_TOPIC, handlerForTopic } from './registry';
import type { EntryTelegramRef, ResolveContext, ResolveStatus, ResolveStatusCounts } from './types';

// Must stay aligned with entryMeetsVoiceGate() in registry.ts.
// Unset covers legacy entries; failed is retried on backlog re-runs.
export const ELIGIBLE_RESOLVE_STATUS_WHERE =
  '(e.resolveStatus IS NULL OR e.resolveStatus = \'pending\' OR e.resolveStatus = \'failed\')';

const PENDING_PICK_MATCH = `
  MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
  WHERE ${ELIGIBLE_RESOLVE_STATUS_WHERE} AND c.topic = $topic
  MATCH (e)-[:HAS_VOICE]->(v:Voice)
  WHERE v.transcription IS NOT NULL
`;

export async function pickEntriesPendingResolve(limit: number): Promise<string[]> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      ${PENDING_PICK_MATCH}
      WITH DISTINCT e
      ORDER BY e.date
      RETURN e.id AS entryId
      LIMIT $limit
      `,
      { topic: ENROLMENT_TOPIC, limit: neo4j.int(limit) }
    );
    return result.records.map((r) => r.get('entryId') as string);
  } finally {
    await session.close();
  }
}

export async function countEntriesPendingResolve(): Promise<number> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      ${PENDING_PICK_MATCH}
      RETURN count(DISTINCT e) AS count
      `,
      { topic: ENROLMENT_TOPIC }
    );
    return result.records[0].get('count').toNumber();
  } finally {
    await session.close();
  }
}

export async function countResolveStatusByStatus(): Promise<ResolveStatusCounts> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
      WHERE c.topic = $topic
      RETURN e.resolveStatus AS status, count(DISTINCT e) AS count
      `,
      { topic: ENROLMENT_TOPIC }
    );

    const counts: ResolveStatusCounts = {
      unset: 0,
      pending: 0,
      attempted: 0,
      successful: 0,
      failed: 0,
    };

    for (const record of result.records) {
      const status = record.get('status') as ResolveStatus | null;
      const count = record.get('count').toNumber();
      if (status == null) {
        counts.unset += count;
      } else if (status in counts) {
        counts[status] += count;
      }
    }

    return counts;
  } finally {
    await session.close();
  }
}

export async function markEntryResolveAttempted(entryId: string): Promise<boolean> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (e:Entry { id: $entryId })
      WHERE e.resolveStatus IS NULL OR e.resolveStatus = 'pending' OR e.resolveStatus = 'failed'
      SET e.resolveStatus = 'attempted',
          e.resolveAttemptedAt = datetime(),
          e.resolveFailureReason = null
      RETURN e.id AS entryId
      `,
      { entryId }
    );
    return result.records.length > 0;
  } finally {
    await session.close();
  }
}

export async function markEntryResolveSuccessful(entryId: string): Promise<void> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    await session.run(
      `
      MATCH (e:Entry { id: $entryId })
      SET e.resolveStatus = 'successful',
          e.resolvedAt = datetime(),
          e.resolveFailureReason = null
      `,
      { entryId }
    );
  } finally {
    await session.close();
  }
}

export async function markEntryResolveFailed(
  entryId: string,
  reason: string
): Promise<void> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    await session.run(
      `
      MATCH (e:Entry { id: $entryId })
      SET e.resolveStatus = 'failed',
          e.resolveFailureReason = $reason
      `,
      { entryId, reason }
    );
  } finally {
    await session.close();
  }
}

export async function loadEntryResolveRecord(
  entryId: string
): Promise<EntryResolveRecord | null> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (e:Entry { id: $entryId })-[:SENT_BY]->(p:Participant)
      MATCH (e)-[:FROM_CHAT]->(c:TelegramChat)
      OPTIONAL MATCH (e)-[:HAS_TEXT]->(t:TextContent)
      OPTIONAL MATCH (e)-[:HAS_VOICE]->(v:Voice)
      RETURN e.id AS entryId,
             c.topic AS topic,
             p.handle AS participantHandle,
             t.text AS textContent,
             v.transcription AS transcription,
             v.processingStatus AS voiceStatus,
             v IS NOT NULL AS hasVoice
      `,
      { entryId }
    );

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    return {
      entryId: record.get('entryId') as string,
      topic: record.get('topic') as string | null,
      participantHandle: record.get('participantHandle') as string,
      textContent: record.get('textContent') as string | undefined,
      transcription: record.get('transcription') as string | undefined,
      voiceStatus: record.get('voiceStatus') as string | null,
      hasVoice: Boolean(record.get('hasVoice')),
    };
  } finally {
    await session.close();
  }
}

export async function loadResolveContext(
  entryId: string
): Promise<ResolveContext | null> {
  const record = await loadEntryResolveRecord(entryId);
  if (!record) {
    return null;
  }

  const handler = handlerForTopic(record.topic ?? undefined);
  if (!handler) {
    return null;
  }

  if (evaluateResolveEligibility(record).status !== 'ready') {
    return null;
  }

  return {
    entryId: record.entryId,
    topic: record.topic ?? '',
    handler,
    participantHandle: record.participantHandle,
    textContent: record.textContent,
    transcription: record.transcription,
  };
}

export async function loadEntryTelegramRef(
  entryId: string
): Promise<EntryTelegramRef | null> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (e:Entry { id: $entryId })-[:FROM_CHAT]->(c:TelegramChat)
      RETURN e.messageId AS messageId, c.id AS chatId
      `,
      { entryId }
    );

    if (result.records.length === 0) return null;

    const record = result.records[0];
    const messageId = record.get('messageId');
    const chatId = record.get('chatId');

    if (messageId == null || chatId == null) return null;

    return {
      messageId: typeof messageId === 'object' ? messageId.toNumber() : messageId,
      chatId: typeof chatId === 'object' ? chatId.toNumber() : chatId,
    };
  } finally {
    await session.close();
  }
}
