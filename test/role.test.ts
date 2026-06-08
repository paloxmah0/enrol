import { handleRoleMessage } from '@/lib/enrolment/role';

describe('handleRoleMessage', () => {
  it('does not return a reply', async () => {
    const reply = await handleRoleMessage({
      message: {
        chat: { id: 1 },
        voice: { file_id: 'voice-1' },
      },
    });

    expect(reply).toBeNull();
  });
});
