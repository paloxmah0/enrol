import { handleAskMessage } from '@/lib/enrolment/ask';
import { routeEnrolmentMessage } from '@/lib/enrolment/routeMessage';

jest.mock('@/lib/enrolment/ask', () => ({
  ...jest.requireActual('@/lib/enrolment/ask'),
  handleAskMessage: jest.fn(),
}));

const mockedHandleAskMessage = handleAskMessage as jest.MockedFunction<
  typeof handleAskMessage
>;

describe('routeEnrolmentMessage', () => {
  beforeEach(() => {
    mockedHandleAskMessage.mockReset();
  });

  it('routes /ask text to handleAskMessage', async () => {
    mockedHandleAskMessage.mockResolvedValue(null);

    const result = await routeEnrolmentMessage({
      message: { text: '/ask How do I enrol?' },
    });

    expect(result).toEqual({ route: 'ask', reply: null });
    expect(mockedHandleAskMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores voice messages without a reply', async () => {
    const result = await routeEnrolmentMessage({
      message: { voice: { file_id: 'v1' } },
    });

    expect(result).toEqual({ route: 'ignored', reply: null });
    expect(mockedHandleAskMessage).not.toHaveBeenCalled();
  });

  it('ignores audio messages without a reply', async () => {
    const result = await routeEnrolmentMessage({
      message: { audio: { file_id: 'a1' } },
    });

    expect(result).toEqual({ route: 'ignored', reply: null });
    expect(mockedHandleAskMessage).not.toHaveBeenCalled();
  });

  it('returns guidance for other text', async () => {
    const result = await routeEnrolmentMessage({
      message: { text: 'hello' },
    });

    expect(result.route).toBe('unsupported');
    expect(result.reply).toContain('/ask questions and voice notes for role enrolment');
    expect(mockedHandleAskMessage).not.toHaveBeenCalled();
  });
});
