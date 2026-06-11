import { isAskText } from '@/lib/enrolment/ask';
import { entryMeetsVoiceGate } from './registry';
import type { ResolveSkipReason } from './types';

export interface EntryResolveRecord {
  entryId: string;
  topic: string | null;
  participantHandle: string;
  textContent?: string;
  transcription?: string;
  voiceStatus: string | null;
  hasVoice: boolean;
}

export type ResolveEligibility =
  | { status: 'ready' }
  | { status: 'skipped'; reason: ResolveSkipReason };

/** Whether a stored entry is eligible for role enrolment resolve. */
export function evaluateResolveEligibility(record: EntryResolveRecord): ResolveEligibility {
  if (isAskText(record.textContent)) {
    return { status: 'skipped', reason: 'not_role_enrolment' };
  }

  if (record.hasVoice) {
    if (!entryMeetsVoiceGate(record.voiceStatus, record.transcription)) {
      return { status: 'skipped', reason: 'voice_not_ready' };
    }

    return { status: 'ready' };
  }

  return { status: 'skipped', reason: 'not_role_enrolment' };
}
