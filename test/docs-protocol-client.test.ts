import { fetchProtocolChannel } from '@/lib/docs/client';

describe('fetchProtocolChannel', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env.DOCS_APP_URL = 'https://docs.example.com';
    process.env.PRIVATE_API_TOKEN = 'test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('returns structured protocol payload on success', async () => {
    const payload = {
      domain: 'enrolment',
      version: '1.0.0',
      commitSha: 'abc123',
      nodes: {
        role: {
          schema: { stakeholder_type: '<extracted>' },
          commitSha: 'role-sha',
        },
      },
      subgraph: {
        relationships: [
          { from: 'entry', to: 'role', type: 'ITERATION_OF', cardinality: 'many-to-one' },
        ],
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const result = await fetchProtocolChannel('enrolment');
    expect(result).toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://docs.example.com/api/protocol/enrolment',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      })
    );
  });

  it('throws schema_not_found on 404', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(fetchProtocolChannel('enrolment')).rejects.toThrow(
      'schema_not_found: enrolment'
    );
  });
});
