import { logger } from '@/lib/logger';
import type {
  RagAcceptedResponse,
  RagQuestionMetadata,
  RagRequest,
} from '@/lib/ask/types';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function defaultCallbackUrl(): string {
  const base = requireEnv('ENROL_APP_URL').replace(/\/$/, '');
  return `${base}/api/ask/response`;
}

/** Fire-and-forget dispatch to evaluate POST /api/rag (expects 202). */
export async function dispatchRagRequest(
  query: string,
  metadata: RagQuestionMetadata,
): Promise<void> {
  const evaluateAppUrl = requireEnv('EVALUATE_APP_URL').replace(/\/$/, '');
  const url = `${evaluateAppUrl}/api/rag`;

  const body: RagRequest = {
    query,
    preset: 'enrolment',
    metadata,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status !== 202) {
    throw new Error(`rag_dispatch_failed: ${res.status}`);
  }

  const payload = (await res.json()) as RagAcceptedResponse;
  if (payload.status !== 'accepted') {
    throw new Error('rag_dispatch_invalid_response');
  }

  logger.info('Dispatched RAG request', {
    queryLength: query.length,
    telegramChat: metadata.telegramChat,
    processingMessageId: metadata.processingMessageId,
  });
}
