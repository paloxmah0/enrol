import { initDriver } from '@/lib/db/neo4j';
import { entryMeetsVoiceGate, handlerForTopic } from './registry';
import type { EntryTelegramRef, ResolveContext } from './types';

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

export async function loadResolveContext(
  entryId: string
): Promise<ResolveContext | null> {
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
             v.processingStatus AS voiceStatus
      `,
      { entryId }
    );

    if (result.records.length === 0) return null;

    const record = result.records[0];
    const topic = record.get('topic') as string | null;
    const handler = handlerForTopic(topic ?? undefined);
    if (!handler) return null;

    const voiceStatus = record.get('voiceStatus') as string | null;
    const transcription = record.get('transcription') as string | undefined;

    if (!entryMeetsVoiceGate(voiceStatus, transcription)) {
      return null;
    }

    return {
      entryId,
      topic: topic ?? '',
      handler,
      participantHandle: record.get('participantHandle') as string,
      textContent: record.get('textContent') as string | undefined,
      transcription,
    };
  } finally {
    await session.close();
  }
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
