import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

const SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET || '';

export function handleError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

export function isValidSignature(payload: string, receivedSignature: string): boolean {
  logger.info('Verifying webhook signature...');
  logger.debug(`Received signature: ${receivedSignature}`);

  const hmac = createHmac('sha256', SIGNING_SECRET);
  const calculatedSignature = hmac.update(payload).digest('base64');
  
  logger.debug(`Calculated signature: ${calculatedSignature}`);

  try {
    return timingSafeEqual(
      Buffer.from(calculatedSignature),
      Buffer.from(receivedSignature)
    );
  } catch {
    return false;
  }
}
  