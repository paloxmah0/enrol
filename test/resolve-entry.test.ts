import { runEntryResolve } from '@/lib/enrolment/resolve/entry';
import {
  loadEntryResolveRecord,
  markEntryResolveFailed,
  markEntryResolveSuccessful,
} from '@/lib/enrolment/resolve/neo4j';
import { resolveRoleEntry } from '@/lib/enrolment/resolve/schema/resolveRole';

jest.mock('@/lib/enrolment/resolve/neo4j', () => ({
  loadEntryResolveRecord: jest.fn(),
  markEntryResolveFailed: jest.fn(),
  markEntryResolveSuccessful: jest.fn(),
}));

jest.mock('@/lib/enrolment/resolve/schema/resolveRole', () => ({
  resolveRoleEntry: jest.fn(),
}));

const mockedLoadRecord = loadEntryResolveRecord as jest.MockedFunction<
  typeof loadEntryResolveRecord
>;
const mockedMarkFailed = markEntryResolveFailed as jest.MockedFunction<
  typeof markEntryResolveFailed
>;
const mockedMarkSuccessful = markEntryResolveSuccessful as jest.MockedFunction<
  typeof markEntryResolveSuccessful
>;
const mockedResolveRoleEntry = resolveRoleEntry as jest.MockedFunction<
  typeof resolveRoleEntry
>;

describe('runEntryResolve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips /ask entries without marking failed', async () => {
    mockedLoadRecord.mockResolvedValue({
      entryId: 'e1',
      topic: '_botEnrolment',
      participantHandle: 'alice',
      textContent: '/ask How do I enrol?',
      voiceStatus: null,
      hasVoice: false,
    });

    const result = await runEntryResolve('e1');

    expect(result).toEqual({
      entryId: 'e1',
      status: 'skipped',
      reason: 'not_role_enrolment',
    });
    expect(mockedMarkFailed).not.toHaveBeenCalled();
    expect(mockedResolveRoleEntry).not.toHaveBeenCalled();
  });

  it('skips voice-not-ready entries without marking failed', async () => {
    mockedLoadRecord.mockResolvedValue({
      entryId: 'e2',
      topic: '_botEnrolment',
      participantHandle: 'alice',
      voiceStatus: 'pending',
      hasVoice: true,
      transcription: undefined,
    });

    const result = await runEntryResolve('e2');

    expect(result).toEqual({
      entryId: 'e2',
      status: 'skipped',
      reason: 'voice_not_ready',
    });
    expect(mockedMarkFailed).not.toHaveBeenCalled();
    expect(mockedResolveRoleEntry).not.toHaveBeenCalled();
  });

  it('resolves transcribed voice entries', async () => {
    mockedLoadRecord.mockResolvedValue({
      entryId: 'e3',
      topic: '_botEnrolment',
      participantHandle: 'alice',
      voiceStatus: 'transcribed',
      hasVoice: true,
      transcription: 'I want to join as facilitator',
    });
    mockedResolveRoleEntry.mockResolvedValue(undefined);

    const result = await runEntryResolve('e3');

    expect(result).toEqual({
      entryId: 'e3',
      handler: 'enrolment',
      resolveStatus: 'successful',
    });
    expect(mockedResolveRoleEntry).toHaveBeenCalled();
    expect(mockedMarkSuccessful).toHaveBeenCalledWith('e3');
  });
});
