import type { TelegramWebhookPayload } from '@/lib/telegram';
import { handleAskMessage, isAskText, type AskMessageOptions } from '@/lib/enrolment/ask';
import { handleRoleMessage } from '@/lib/enrolment/role';

export type EnrolmentRoute = 'ask' | 'role' | 'unsupported';

const DOCS_URL = 'https://docs.prisma.events/processes/enrolment';

export type EnrolmentMessageOptions = {
  ask?: AskMessageOptions;
};

export function classifyEnrolmentMessage(
  payload: TelegramWebhookPayload
): EnrolmentRoute {
  const message = payload.message;
  if (!message) {
    return 'unsupported';
  }

  if (isAskText(message.text)) {
    return 'ask';
  }

  if (message.voice || message.audio) {
    return 'role';
  }

  return 'unsupported';
}

export async function routeEnrolmentMessage(
  payload: TelegramWebhookPayload,
  options?: EnrolmentMessageOptions
): Promise<{ route: EnrolmentRoute; reply: string | null }> {
  const route = classifyEnrolmentMessage(payload);

  if (route === 'ask') {
    const reply = await handleAskMessage(payload, options?.ask);
    return { route, reply };
  }

  if (route === 'role') {
    const reply = await handleRoleMessage(payload);
    return { route, reply };
  }

  return {
    route,
    reply: `This channel supports /ask questions and voice notes for role enrolment. See the docs for guidance: ${DOCS_URL}`,
  };
}
