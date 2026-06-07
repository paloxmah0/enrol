import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { handleError, isValidSignature } from '@/lib/utils';

// Ensure Node.js runtime since we rely on 'crypto'
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  logger.info('Webhook triggered.');

  try {
    const receivedSignature = request.headers.get('tally-signature') || '';
    const rawBody = await request.text();

    if (!isValidSignature(rawBody, receivedSignature)) {
      logger.warn('Invalid webhook signature');
      return new NextResponse('Invalid signature.', { status: 401 });
    }

    logger.info(`Signature valid.`);

    let json;
    try {
      json = JSON.parse(rawBody);
    } catch (err) {
      logger.error('Invalid JSON in request body', { err });
      return new NextResponse('Invalid JSON', { status: 400 });
    }

    await redis.lpush('enrolment-partners-evaluators', JSON.stringify(json));
    logger.info(`Tally event queued. Type: ${json.eventType}, Form: ${json.data.formName}`);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    logger.error('Webhook error', { error });
    return handleError(error);
  }
}

// Some providers probe with HEAD before sending POST
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

// Gracefully handle OPTIONS if a preflight occurs
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  try {
    const rawMessages = await redis.lrange("enrolment-partners-evaluators", 0, -1);

    const messages = rawMessages
      .map((raw: any) => {
        // If it's a string, parse it
        if (typeof raw === "string") return JSON.parse(raw);
        // If it's already an object (e.g., stored incorrectly), just return it
        return raw;
      })
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("Redis fetch/sort error:", err);
    return NextResponse.json({ error: "Failed to fetch from Redis" }, { status: 500 });
  }
}
