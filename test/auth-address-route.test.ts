import { GET, POST } from '@/app/api/auth/[address]/route';
import { NextRequest } from 'next/server';

const TEST_ADDRESS =
  'addr_test1qzhp0ey7tlr3rawe9vp4un80jxa9ryaw062vnd7ptv2qhwt85adh8c8rexysev0a3apvfcajgns9utaky9hqu734q96qtqd62y';

function buildRequest(address: string, access = 'propagate', token = 'test-token') {
  return new NextRequest(
    `http://localhost:3000/api/auth/${encodeURIComponent(address)}?access=${encodeURIComponent(access)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

describe('API /api/auth/[address]', () => {
  const originalToken = process.env.PRIVATE_API_TOKEN;

  beforeEach(() => {
    process.env.PRIVATE_API_TOKEN = 'test-token';
  });

  afterAll(() => {
    process.env.PRIVATE_API_TOKEN = originalToken;
  });

  it('rejects unauthorized requests', async () => {
    const res = await GET(buildRequest(TEST_ADDRESS, 'propagate', 'wrong'), {
      params: Promise.resolve({ address: TEST_ADDRESS }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects missing access param', async () => {
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/auth/${encodeURIComponent(TEST_ADDRESS)}`, {
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
      }),
      { params: Promise.resolve({ address: TEST_ADDRESS }) }
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid address', async () => {
    const res = await GET(buildRequest('not-an-address'), {
      params: Promise.resolve({ address: 'not-an-address' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns authorized stub response', async () => {
    const res = await GET(buildRequest(TEST_ADDRESS), {
      params: Promise.resolve({ address: TEST_ADDRESS }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      data: {
        address: TEST_ADDRESS,
        authorized: true,
        hubRole: 'OWNER',
      },
    });
  });

  it('rejects POST', async () => {
    const res = await POST();
    expect(res.status).toBe(405);
  });
});
