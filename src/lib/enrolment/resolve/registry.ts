import type { ResolveHandlerName } from './types';

export const ENROLMENT_TOPIC = '_botEnrolment' as const;

export const RESOLVE_TOPIC_HANDLERS = {
  [ENROLMENT_TOPIC]: 'enrolment',
} as const satisfies Record<string, ResolveHandlerName>;

export function handlerForTopic(
  topic: string | undefined
): ResolveHandlerName | null {
  if (!topic) return null;
  return topic === ENROLMENT_TOPIC ? 'enrolment' : null;
}

/** Voice entries are ready when transcribed; text-only entries have no voice node. */
export function entryMeetsVoiceGate(
  voiceStatus: string | null,
  transcription?: string | null
): boolean {
  if (!voiceStatus) return true;
  return !!transcription?.trim();
}
