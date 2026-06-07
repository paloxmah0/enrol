import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export function verifyInfraRequest(request: NextRequest): NextResponse | null {
  const expected = process.env.PRIVATE_API_TOKEN;
  if (!expected) {
    logger.warn('Infra auth rejected: PRIVATE_API_TOKEN not configured', {
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { error: 'PRIVATE_API_TOKEN not configured' },
      { status: 500 }
    );
  }

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    logger.warn('Infra auth rejected: missing or invalid Authorization header', {
      path: request.nextUrl.pathname,
      hasAuthHeader: !!header,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = header.slice('Bearer '.length);
  if (token !== expected) {
    logger.warn('Infra auth rejected: token mismatch', {
      path: request.nextUrl.pathname,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
