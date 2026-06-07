import { NextRequest, NextResponse } from 'next/server';
import { runEntryResolve } from '@/lib/enrolment/resolve/entry';
import { removeFromOrganisingQueue } from '@/lib/enrolment/resolve/queue';
import { logger } from '@/lib/logger';
import { verifyInfraRequest } from '@/lib/private-auth';

export async function POST(request: NextRequest) {
  const authError = verifyInfraRequest(request);
  if (authError) {
    return authError;
  }

  const entryId = request.nextUrl.searchParams.get('entryId');
  if (!entryId?.trim()) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
  }

  logger.info('Enrolment resolve worker invoked', { entryId });

  try {
    const result = await runEntryResolve(entryId);
    await removeFromOrganisingQueue(entryId);

    return NextResponse.json({ status: 'ok', result }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Enrolment resolve worker failed', { entryId, error: message });

    try {
      await removeFromOrganisingQueue(entryId);
    } catch (cleanupError) {
      logger.error('Organising queue cleanup failed after resolve error', {
        entryId,
        error: cleanupError instanceof Error ? cleanupError.message : cleanupError,
      });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
