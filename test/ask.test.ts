import { extractAskQuery, handleAskMessage } from '@/lib/enrolment/ask';
import { fetchRagAnswer } from '@/lib/ask/client';

jest.mock('@/lib/ask/client', () => ({
  fetchRagAnswer: jest.fn(),
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
  const mockedFetchRagAnswer = fetchRagAnswer as jest.MockedFunction<
    typeof fetchRagAnswer
  >;

  beforeEach(() => {
    mockedFetchRagAnswer.mockReset();
  });

  it('returns the RAG answer for /ask messages', async () => {
    mockedFetchRagAnswer.mockResolvedValue('Use a voice note to enrol a role.');

    const reply = await handleAskMessage({
      message: {
        chat: { id: 1 },
        text: '/ask How do I enrol?',
      },
    });

    expect(reply).toBe('Use a voice note to enrol a role.');
    expect(mockedFetchRagAnswer).toHaveBeenCalledWith('How do I enrol?');
  });

  it('returns usage guidance when no question is provided', async () => {
    const reply = await handleAskMessage({
      message: {
        chat: { id: 1 },
        text: '/ask',
      },
    });

    expect(reply).toContain('Send a question after /ask');
    expect(mockedFetchRagAnswer).not.toHaveBeenCalled();
  });

  it('returns a friendly error when RAG fetch fails', async () => {
    mockedFetchRagAnswer.mockRejectedValue(new Error('rag_request_failed: 500'));

    const reply = await handleAskMessage({
      message: {
        chat: { id: 1 },
        text: '/ask What is a role?',
      },
    });

    expect(reply).toContain('could not answer');
  });

  it('shows and removes a processing indicator while fetching', async () => {
    const callOrder: string[] = [];

    mockedFetchRagAnswer.mockImplementation(async () => {
      callOrder.push('fetch');
      return 'Answer ready.';
    });

    const sendProcessingIndicator = jest.fn().mockImplementation(async () => {
      callOrder.push('send');
      return 42;
    });
    const deleteProcessingIndicator = jest.fn().mockImplementation(async () => {
      callOrder.push('delete');
    });

    const reply = await handleAskMessage(
      {
        message: {
          chat: { id: 1 },
          text: '/ask What is a role?',
        },
      },
      { sendProcessingIndicator, deleteProcessingIndicator }
    );

    expect(reply).toBe('Answer ready.');
    expect(callOrder).toEqual(['send', 'fetch', 'delete']);
    expect(deleteProcessingIndicator).toHaveBeenCalledWith(42);
  });

  it('does not show a processing indicator for usage replies', async () => {
    const sendProcessingIndicator = jest.fn();
    const deleteProcessingIndicator = jest.fn();

    await handleAskMessage(
      {
        message: {
          chat: { id: 1 },
          text: '/ask',
        },
      },
      { sendProcessingIndicator, deleteProcessingIndicator }
    );

    expect(sendProcessingIndicator).not.toHaveBeenCalled();
    expect(deleteProcessingIndicator).not.toHaveBeenCalled();
  });
});
