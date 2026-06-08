/** @jest-environment node */

import { POST } from '@/app/api/ask/response/route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/private-auth', () => ({
  verifyInfraRequest: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/telegram', () => ({
  deleteTelegramMessage: jest.fn().mockResolvedValue(undefined),
  sendTelegramMessage: jest.fn().mockResolvedValue({ message_id: 100 }),
}));

import { deleteTelegramMessage, sendTelegramMessage } from '@/lib/telegram';

describe('POST /api/ask/response', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes processing message and sends answer', async () => {
    const request = new NextRequest('https://enrol.example.com/api/ask/response', {
      method: 'POST',
      body: JSON.stringify({
        telegramChat: 1,
        processingMessageId: 42,
        messageThreadId: 7,
        answer: 'Enrolment uses voice notes.',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(deleteTelegramMessage).toHaveBeenCalledWith(1, 42);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      1,
      'Enrolment uses voice notes.',
      { message_thread_id: 7 }
    );
  });
});
