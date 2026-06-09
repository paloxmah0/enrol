import { POST } from '@/app/api/webhook/resolve/route';
import { runBacklogResolveTick } from '@/lib/enrolment/resolve/backlog';
import { runEntryResolve } from '@/lib/enrolment/resolve/entry';
import { NextRequest } from 'next/server';

jest.mock('@/lib/enrolment/resolve/backlog', () => ({
  runBacklogResolveTick: jest.fn(),
}));

jest.mock('@/lib/enrolment/resolve/entry', () => ({
  runEntryResolve: jest.fn(),
}));

const mockedRunBacklogResolveTick =
  runBacklogResolveTick as jest.MockedFunction<typeof runBacklogResolveTick>;
const mockedRunEntryResolve = runEntryResolve as jest.MockedFunction<typeof runEntryResolve>;

const emptyCounts = { unset: 0, pending: 0, attempted: 0, successful: 0, failed: 0 };

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

function buildBacklogRequest(token = 'test-token') {
  return new NextRequest('http://localhost:3000/api/webhook/resolve?backlog=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

describe('API /api/webhook/resolve', () => {
  const originalToken = process.env.PRIVATE_API_TOKEN;

  beforeEach(() => {
    process.env.PRIVATE_API_TOKEN = 'test-token';
    mockedRunBacklogResolveTick.mockReset();
    mockedRunEntryResolve.mockReset();
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

  it('runs entry resolve for a valid entryId', async () => {
    mockedRunEntryResolve.mockResolvedValue({
      entryId: 'e1',
      handler: 'enrolment',
      resolveStatus: 'successful',
    });

    const res = await POST(buildRequest('e1'));
    expect(res.status).toBe(200);
    expect(mockedRunEntryResolve).toHaveBeenCalledWith('e1');

    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.result.resolveStatus).toBe('successful');
  });

  it('returns skipped status for non-role entries', async () => {
    mockedRunEntryResolve.mockResolvedValue({
      entryId: 'e1',
      status: 'skipped',
      reason: 'not_role_enrolment',
    });

    const res = await POST(buildRequest('e1'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('skipped');
    expect(json.result).toEqual({
      entryId: 'e1',
      status: 'skipped',
      reason: 'not_role_enrolment',
    });
  });

  it('processes one backlog entry when backlog=true', async () => {
    mockedRunBacklogResolveTick.mockResolvedValue({
      status: 'success',
      entryId: 'e2',
      result: { entryId: 'e2', handler: 'enrolment', resolveStatus: 'successful' },
      outstanding: 1,
      hasMore: true,
      counts: { ...emptyCounts, successful: 1, pending: 1 },
    });

    const res = await POST(buildBacklogRequest());
    expect(res.status).toBe(200);
    expect(mockedRunBacklogResolveTick).toHaveBeenCalled();
    expect(mockedRunEntryResolve).not.toHaveBeenCalled();

    const json = await res.json();
    expect(json.backlog).toBe(true);
    expect(json.entryId).toBe('e2');
    expect(json.hasMore).toBe(true);
    expect(json.outstanding).toBe(1);
  });

  it('returns idle backlog response when nothing is pending', async () => {
    mockedRunBacklogResolveTick.mockResolvedValue({
      status: 'idle',
      outstanding: 0,
      hasMore: false,
      counts: emptyCounts,
    });

    const res = await POST(buildBacklogRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('idle');
    expect(json.hasMore).toBe(false);
  });
});
