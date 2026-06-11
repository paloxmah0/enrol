import type { TelegramWebhookPayload } from '@/lib/telegram';
import { handleAskMessage, isAskText, type AskMessageOptions } from '@/lib/enrolment/ask';

export type EnrolmentRoute = 'ask' | 'ignored' | 'unsupported';

const DOCS_URL = 'https://docs.prisma.events/processes/enrolment';

const GUIDANCE =
  `This channel supports /ask questions and voice notes for role enrolment. See the docs for guidance: ${DOCS_URL}`;

export type EnrolmentMessageOptions = {
  ask?: AskMessageOptions;
};

export async function routeEnrolmentMessage(
  payload: TelegramWebhookPayload,
  options?: EnrolmentMessageOptions
): Promise<{ route: EnrolmentRoute; reply: string | null }> {
  const message = payload.message;
  if (!message || message.voice || message.audio) {
    return { route: 'ignored', reply: null };
  }

  if (isAskText(message.text)) {
    const reply = await handleAskMessage(payload, options?.ask);
    return { route: 'ask', reply };
  }

  return { route: 'unsupported', reply: GUIDANCE };
}
