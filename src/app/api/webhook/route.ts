import { NextRequest, NextResponse } from 'next/server';
import { routeEnrolmentMessage } from '@/lib/enrolment/routeMessage';
import { logger } from '@/lib/logger';
import {
  messageThreadIdFromWebhookPayload,
  sendTelegramMessage,
  topicFromWebhookPayload,
  type TelegramWebhookPayload,
} from '@/lib/telegram';
import { handleError } from '@/lib/utils';

export async function POST(request: NextRequest) {
  if (request.method !== 'POST') {
    return new NextResponse('Method Not Allowed', { status: 405 });
  }

  logger.info('Enrolment telegram webhook triggered.');

  try {
    const payload = (await request.json()) as TelegramWebhookPayload;
    const chatId = payload.message?.chat?.id;
    const messageId = payload.message?.message_id;
    const topic = topicFromWebhookPayload(payload);
    const messageThreadId = messageThreadIdFromWebhookPayload(payload);

    if (!chatId) {
      logger.info('Webhook ignored: no chat id in payload.');
      return NextResponse.json({ status: 'ignored' });
    }

    const { route, reply } = await routeEnrolmentMessage(payload);

    await sendTelegramMessage(chatId, reply, {
      ...(messageThreadId ? { message_thread_id: messageThreadId } : {}),
    });

    logger.info('Enrolment webhook reply sent.', {
      chatId,
      messageId,
      topic,
      messageThreadId,
      route,
      reply,
    });

    return NextResponse.json({ status: 'ok', route, reply });
  } catch (error) {
    logger.error('Enrolment webhook error', { error });
    return handleError(error);
  }
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
