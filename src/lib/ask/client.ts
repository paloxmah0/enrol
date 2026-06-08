import { logger } from '@/lib/logger';
import type { RagRequest, RagResponse } from '@/lib/ask/types';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function validateRagResponse(body: unknown): RagResponse {
  if (body == null || typeof body !== 'object') {
    throw new Error('rag_invalid_response');
  }

  const payload = body as Partial<RagResponse>;
  if (payload.answer !== null && typeof payload.answer !== 'string') {
    throw new Error('rag_missing_answer');
  }

  return { answer: payload.answer ?? null };
}

/** RAG answer from evaluate POST /api/rag. */
export async function fetchRagAnswer(query: string): Promise<string> {
  const evaluateAppUrl = requireEnv('EVALUATE_APP_URL').replace(/\/$/, '');
  const url = `${evaluateAppUrl}/api/rag`;

  const body: RagRequest = { query };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`rag_request_failed: ${res.status}`);
  }

  const payload = validateRagResponse(await res.json());
  const answer = payload.answer?.trim();

  logger.info('Fetched RAG answer', {
    queryLength: query.length,
    answerLength: answer?.length ?? 0,
  });

  return answer || 'No response.';
}
