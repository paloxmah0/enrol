import { POST } from '@/app/api/webhook/resolve/route';
import { runEntryResolve } from '@/lib/enrolment/resolve/entry';
import { removeFromOrganisingQueue } from '@/lib/enrolment/resolve/queue';
import { NextRequest } from 'next/server';

jest.mock('@/lib/enrolment/resolve/entry', () => ({
  runEntryResolve: jest.fn(),
}));

jest.mock('@/lib/enrolment/resolve/queue', () => ({
  removeFromOrganisingQueue: jest.fn(),
}));

const mockedRunEntryResolve = runEntryResolve as jest.MockedFunction<typeof runEntryResolve>;
const mockedRemoveFromOrganisingQueue =
  removeFromOrganisingQueue as jest.MockedFunction<typeof removeFromOrganisingQueue>;

function buildRequest(entryId: string, token = 'test-token') {
  return new NextRequest(
    `http://localhost:3000/api/webhook/resolve?entryId=${encodeURIComponent(entryId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

describe('API /api/webhook/resolve', () => {
  const originalToken = process.env.PRIVATE_API_TOKEN;

  beforeEach(() => {
    process.env.PRIVATE_API_TOKEN = 'test-token';
    mockedRunEntryResolve.mockReset();
    mockedRemoveFromOrganisingQueue.mockReset();
    mockedRemoveFromOrganisingQueue.mockResolvedValue(true);
  });

  afterAll(() => {
    process.env.PRIVATE_API_TOKEN = originalToken;
  });

  it('rejects missing entryId', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/webhook/resolve', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects unauthorized requests', async () => {
    const res = await POST(buildRequest('e1', 'wrong'));
    expect(res.status).toBe(401);
  });

  it('runs entry resolve and cleans up organising queue', async () => {
    mockedRunEntryResolve.mockResolvedValue({
      entryId: 'e1',
      handler: 'enrolment',
      resolveStatus: 'successful',
    });

    const res = await POST(buildRequest('e1'));
    expect(res.status).toBe(200);
    expect(mockedRunEntryResolve).toHaveBeenCalledWith('e1');
    expect(mockedRemoveFromOrganisingQueue).toHaveBeenCalledWith('e1');

    const json = await res.json();
    expect(json.result.resolveStatus).toBe('successful');
  });
});
