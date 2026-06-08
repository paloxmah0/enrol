import { NextRequest, NextResponse } from 'next/server';
import type { RagCallbackPayload } from '@/lib/ask/types';
import { logger } from '@/lib/logger';
import { verifyInfraRequest } from '@/lib/private-auth';
import {
  deleteTelegramMessage,
  sendTelegramMessage,
} from '@/lib/telegram';

const FALLBACK_ANSWER =
  'Sorry, I could not answer that right now. Please try again later.';

function parsePayload(body: unknown): RagCallbackPayload | null {
  if (body == null || typeof body !== 'object') return null;
  const payload = body as Partial<RagCallbackPayload>;
  if (payload.telegramChat == null || payload.telegramChat === '') {
    return null;
  }
  if (typeof payload.processingMessageId !== 'number') return null;
  if (typeof payload.answer !== 'string') return null;
  return payload as RagCallbackPayload;
}

export async function POST(request: NextRequest) {
  const authError = verifyInfraRequest(request);
  if (authError) {
    return authError;
  }

  const payload = parsePayload(await request.json());
  if (!payload) {
    return NextResponse.json({ error: 'Invalid callback payload' }, { status: 400 });
  }

  const chatId = Number(payload.telegramChat);
  const threadOptions = payload.messageThreadId
    ? { message_thread_id: payload.messageThreadId }
    : {};

  try {
    await deleteTelegramMessage(chatId, payload.processingMessageId);
  } catch (error) {
    logger.warn('Failed to delete processing message', {
      chatId,
      processingMessageId: payload.processingMessageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const answer = payload.error
    ? FALLBACK_ANSWER
    : payload.answer.trim() || FALLBACK_ANSWER;

  await sendTelegramMessage(chatId, answer, threadOptions);

  logger.info('Ask callback delivered', {
    chatId,
    processingMessageId: payload.processingMessageId,
    answerLength: answer.length,
  });

  return NextResponse.json({ status: 'ok' });
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
