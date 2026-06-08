import { dispatchRagRequest } from '@/lib/ask/client';
import { extractAskQuery, handleAskMessage } from '@/lib/enrolment/ask';

jest.mock('@/lib/ask/client', () => ({
  dispatchRagRequest: jest.fn(),
  defaultCallbackUrl: jest
    .fn()
    .mockReturnValue('https://enrol.example.com/api/ask/response'),
}));

describe('extractAskQuery', () => {
  it('strips /ask and bot suffix', () => {
    expect(extractAskQuery('/ask What is enrolment?')).toBe('What is enrolment?');
    expect(extractAskQuery('/ask@EnrolBot What is enrolment?')).toBe(
      'What is enrolment?'
    );
  });

  it('returns null when only the command is present', () => {
    expect(extractAskQuery('/ask')).toBeNull();
    expect(extractAskQuery('/ask@EnrolBot')).toBeNull();
  });
});

describe('handleAskMessage', () => {
  const mockedDispatch = dispatchRagRequest as jest.MockedFunction<
    typeof dispatchRagRequest
  >;

  beforeEach(() => {
    mockedDispatch.mockReset();
    mockedDispatch.mockResolvedValue(undefined);
  });

  it('dispatches RAG and returns null on success', async () => {
    const reply = await handleAskMessage(
      {
        message: {
          chat: { id: 1 },
          text: '/ask How do I enrol?',
        },
      },
      {
        sendProcessingIndicator: async () => 99,
      }
    );

    expect(reply).toBeNull();
    expect(mockedDispatch).toHaveBeenCalledWith(
      'How do I enrol?',
      expect.objectContaining({
        telegramChat: 1,
        processingMessageId: 99,
        callbackUrl: 'https://enrol.example.com/api/ask/response',
        topic: '_botEnrolment',
      })
    );
  });

  it('returns usage guidance when no question is provided', async () => {
    const reply = await handleAskMessage({
      message: {
        chat: { id: 1 },
        text: '/ask',
      },
    });

    expect(reply).toContain('Send a question after /ask');
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it('returns a friendly error when dispatch fails', async () => {
    mockedDispatch.mockRejectedValue(new Error('rag_dispatch_failed: 500'));

    const reply = await handleAskMessage(
      {
        message: {
          chat: { id: 1 },
          text: '/ask What is a role?',
        },
      },
      {
        sendProcessingIndicator: async () => 99,
      }
    );

    expect(reply).toContain('could not answer');
  });
});
