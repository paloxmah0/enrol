import type { TelegramWebhookPayload } from '@/lib/telegram';
import { handleAskMessage } from '@/lib/enrolment/ask';
import { handleRoleMessage } from '@/lib/enrolment/role';

export type EnrolmentRoute = 'ask' | 'role' | 'unsupported';

const DOCS_URL = 'https://docs.prisma.events/processes/enrolment';

export function classifyEnrolmentMessage(
  payload: TelegramWebhookPayload
): EnrolmentRoute {
  const message = payload.message;
  if (!message) {
    return 'unsupported';
  }

  if (message.text?.startsWith('/ask')) {
    return 'ask';
  }

  if (message.voice || message.audio) {
    return 'role';
  }

  return 'unsupported';
}

export async function routeEnrolmentMessage(
  payload: TelegramWebhookPayload
): Promise<{ route: EnrolmentRoute; reply: string }> {
  const route = classifyEnrolmentMessage(payload);

  if (route === 'ask') {
    const moduleName = await handleAskMessage(payload);
    return { route, reply: moduleName };
  }

  if (route === 'role') {
    const moduleName = await handleRoleMessage(payload);
    return { route, reply: moduleName };
  }

  return {
    route,
    reply: `This channel supports /ask questions and voice notes for role enrolment. See the docs for guidance: ${DOCS_URL}`,
  };
}
