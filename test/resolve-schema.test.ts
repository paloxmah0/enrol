import {
  ENROLMENT_EXTRACTION_NODE,
  extractRoleSnapshotFields,
} from '@/lib/enrolment/resolve/schema/extract';
import { getEntrySourceText } from '@/lib/enrolment/resolve/schema/entryText';
import type { ProtocolChannelPayload } from '@/lib/docs/types';
import type { ResolveContext } from '@/lib/enrolment/resolve/types';

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

import OpenAI from 'openai';

const mockCreate = jest.fn();

const sampleProtocol: ProtocolChannelPayload = {
  domain: 'enrolment',
  version: '1.0.0',
  commitSha: 'abc123',
  nodes: {
    role_snapshot: {
      commitSha: 'snap-sha',
      schema: { intent: '<extracted>' },
    },
  },
  subgraph: {
    relationships: [
      { from: 'role_snapshot', to: 'role', type: 'ITERATION_OF', cardinality: 'many-to-one' },
    ],
  },
};

beforeEach(() => {
  mockCreate.mockReset();
  (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(
    () =>
      ({
        chat: { completions: { create: mockCreate } },
      }) as unknown as OpenAI
  );
  process.env.OPENAI_API_KEY = 'test-key';
});

function buildCtx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    entryId: 'entry-1',
    topic: '_botEnrolment',
    handler: 'enrolment',
    participantHandle: 'alice',
    ...overrides,
  };
}

describe('enrolment resolve schema entryText', () => {
  it('prefers transcription over text', () => {
    const { text, sourceKind } = getEntrySourceText(
      buildCtx({ transcription: ' voice note ', textContent: 'text msg' })
    );
    expect(text).toBe('voice note');
    expect(sourceKind).toBe('voice');
  });

  it('throws when no source text', () => {
    expect(() => getEntrySourceText(buildCtx())).toThrow('no_entry_text');
  });
});

describe('role_snapshot extraction', () => {
  it('extracts schema fields with a lightweight schema + text prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"intent":"join as facilitator"}' } }],
    });

    const result = await extractRoleSnapshotFields(
      sampleProtocol,
      'I want to join as a facilitator'
    );

    expect(result).toEqual({
      role_snapshot: { intent: 'join as facilitator' },
    });
    expect(result[ENROLMENT_EXTRACTION_NODE]).toEqual({ intent: 'join as facilitator' });

    const userPrompt = mockCreate.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain('Schema:');
    expect(userPrompt).toContain('intent');
    expect(userPrompt).toContain('Text:');
    expect(userPrompt).not.toContain('Protocol domain');
    expect(userPrompt).not.toContain('Protocol version');
  });

  it('accepts nested role_snapshot response shape', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ role_snapshot: { intent: 'onboard team' } }),
          },
        },
      ],
    });

    const result = await extractRoleSnapshotFields(sampleProtocol, 'onboard my team');
    expect(result[ENROLMENT_EXTRACTION_NODE]).toEqual({ intent: 'onboard team' });
  });
});
