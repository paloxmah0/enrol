import { NextRequest, NextResponse } from 'next/server';
import { routeEnrolmentMessage } from '@/lib/enrolment/routeMessage';
import { logger } from '@/lib/logger';
import {
  deleteTelegramMessage,
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
    const threadOptions = messageThreadId
      ? { message_thread_id: messageThreadId }
      : {};

    if (!chatId) {
      logger.info('Webhook ignored: no chat id in payload.');
      return NextResponse.json({ status: 'ignored' });
    }

    const { route, reply } = await routeEnrolmentMessage(payload, {
      ask: {
        sendProcessingIndicator: async () => {
          const processingMessage = await sendTelegramMessage(
            chatId,
            '...',
            threadOptions
          );
          return processingMessage.message_id;
        },
        deleteProcessingIndicator: async (processingMessageId) => {
          await deleteTelegramMessage(chatId, processingMessageId);
        },
      },
    });

    if (reply) {
      await sendTelegramMessage(chatId, reply, threadOptions);
    }

    logger.info('Enrolment webhook handled.', {
      chatId,
      messageId,
      topic,
      messageThreadId,
      route,
      reply,
    });

    return NextResponse.json({ status: 'ok', route, reply });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'unknown';
    logger.error('Enrolment webhook error', { errorMessage, errorName });
    return handleError(error);
  }
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
