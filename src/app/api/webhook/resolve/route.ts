import { NextRequest, NextResponse } from 'next/server';
import { runBacklogResolveTick } from '@/lib/enrolment/resolve/backlog';
import { runEntryResolve } from '@/lib/enrolment/resolve/entry';
import { logger } from '@/lib/logger';
import { verifyInfraRequest } from '@/lib/private-auth';

function parseBacklogFlag(value: string | null): boolean {
  if (value == null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'true' || normalized === '1';
}

export async function POST(request: NextRequest) {
  const authError = verifyInfraRequest(request);
  if (authError) {
    return authError;
  }

  const backlog = parseBacklogFlag(request.nextUrl.searchParams.get('backlog'));

  if (backlog) {
    logger.info('Enrolment backlog resolve invoked');

    try {
      const backlogResult = await runBacklogResolveTick();
      return NextResponse.json({ backlog: true, ...backlogResult }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Enrolment backlog resolve failed', { error: message });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const entryId = request.nextUrl.searchParams.get('entryId');
  if (!entryId?.trim()) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
  }

  logger.info('Enrolment resolve worker invoked', { entryId });

  try {
    const result = await runEntryResolve(entryId);
    const status = 'status' in result && result.status === 'skipped' ? 'skipped' : 'ok';
    return NextResponse.json({ status, result }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Enrolment resolve worker failed', { entryId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
