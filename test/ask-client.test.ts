import { fetchRagAnswer } from '@/lib/ask/client';

describe('fetchRagAnswer', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env.EVALUATE_APP_URL = 'https://evaluate.example.com';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('returns the answer from evaluate /api/rag', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answer: 'Enrolment uses voice notes for roles.' }),
    });

    const result = await fetchRagAnswer('How does enrolment work?');

    expect(result).toBe('Enrolment uses voice notes for roles.');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://evaluate.example.com/api/rag',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'How does enrolment work?' }),
      })
    );
  });

  it('throws rag_request_failed on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
    });

    await expect(fetchRagAnswer('test')).rejects.toThrow('rag_request_failed: 502');
  });
});
