import { evaluateResolveEligibility } from '@/lib/enrolment/resolve/eligibility';
import type { EntryResolveRecord } from '@/lib/enrolment/resolve/eligibility';

function record(overrides: Partial<EntryResolveRecord> = {}): EntryResolveRecord {
  return {
    entryId: 'entry-1',
    topic: '_botEnrolment',
    participantHandle: 'alice',
    voiceStatus: null,
    hasVoice: false,
    ...overrides,
  };
}

describe('evaluateResolveEligibility', () => {
  it('skips /ask text entries', () => {
    expect(
      evaluateResolveEligibility(
        record({ textContent: '/ask How do I enrol?', hasVoice: false })
      )
    ).toEqual({ status: 'skipped', reason: 'not_role_enrolment' });
  });

  it('skips /ask@Bot text entries', () => {
    expect(
      evaluateResolveEligibility(
        record({ textContent: '/ask@EnrolBot What is a role?', hasVoice: false })
      )
    ).toEqual({ status: 'skipped', reason: 'not_role_enrolment' });
  });

  it('skips unsupported text-only entries', () => {
    expect(
      evaluateResolveEligibility(
        record({ textContent: 'hello there', hasVoice: false })
      )
    ).toEqual({ status: 'skipped', reason: 'not_role_enrolment' });
  });

  it('skips voice entries until transcription is ready', () => {
    expect(
      evaluateResolveEligibility(
        record({ hasVoice: true, voiceStatus: 'pending', transcription: undefined })
      )
    ).toEqual({ status: 'skipped', reason: 'voice_not_ready' });
  });

  it('allows transcribed voice entries', () => {
    expect(
      evaluateResolveEligibility(
        record({
          hasVoice: true,
          voiceStatus: 'transcribed',
          transcription: 'I want to join as facilitator',
        })
      )
    ).toEqual({ status: 'ready' });
  });
});
