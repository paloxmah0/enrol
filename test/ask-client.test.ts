import { dispatchRagRequest } from '@/lib/ask/client';

describe('dispatchRagRequest', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env.EVALUATE_APP_URL = 'https://evaluate.example.com';
    process.env.ENROL_APP_URL = 'https://enrol.example.com';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('dispatches enrolment preset with callback metadata and expects 202', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ status: 'accepted' }),
    });

    await dispatchRagRequest('How does enrolment work?', {
      telegramChat: 1,
      topic: '_botEnrolment',
      processingMessageId: 42,
      callbackUrl: 'https://enrol.example.com/api/ask/response',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://evaluate.example.com/api/rag',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'How does enrolment work?',
          preset: 'enrolment',
          metadata: {
            telegramChat: 1,
            topic: '_botEnrolment',
            processingMessageId: 42,
            callbackUrl: 'https://enrol.example.com/api/ask/response',
          },
        }),
      })
    );
  });

  it('throws rag_dispatch_failed on non-202 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    await expect(
      dispatchRagRequest('test', {
        telegramChat: 1,
        processingMessageId: 42,
        callbackUrl: 'https://enrol.example.com/api/ask/response',
      })
    ).rejects.toThrow('rag_dispatch_failed: 502');
  });
});
