import { NextRequest, NextResponse } from 'next/server';
import { resolveWalletAccess } from '@/lib/auth/hub-access';
import { isValidCardanoAddress } from '@/lib/auth/validate-address';
import { verifyInfraRequest } from '@/lib/private-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const authError = verifyInfraRequest(request);
  if (authError) {
    return authError;
  }

  const { address } = await params;
  const access = request.nextUrl.searchParams.get('access') ?? '';

  if (!isValidCardanoAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const expectedAccess = process.env.PROPAGATE_AUTH_ACCESS ?? 'propagate';
  if (access !== expectedAccess) {
    return NextResponse.json(
      { error: `Unknown or missing access scope; expected access=${expectedAccess}` },
      { status: 400 }
    );
  }

  try {
    const result = await resolveWalletAccess(address, access);

    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    if (result.status === 'unauthorized') {
      return NextResponse.json({
        data: { address, authorized: false },
      });
    }

    return NextResponse.json({
      data: {
        address,
        authorized: true,
        hubRole: result.hubRole,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authorization check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
