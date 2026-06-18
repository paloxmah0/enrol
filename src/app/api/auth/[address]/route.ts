import { NextRequest, NextResponse } from 'next/server';
import { verifyInfraRequest } from '@/lib/private-auth';

type HubRole = 'OWNER' | 'MEMBER';

type AuthorizedWallet = {
  address: string;
  hubRole: HubRole;
};

const PROPAGATE_ACCESS = 'propagate';

function parseAuthorizedWallets(): AuthorizedWallet[] {
  const raw = process.env.PROPAGATE_AUTH_WALLETS;
  if (!raw) return [];

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [address, rawRole] = entry.split(':').map((part) => part.trim());
      const hubRole: HubRole = rawRole === 'OWNER' ? 'OWNER' : 'MEMBER';
      return { address, hubRole };
    })
    .filter((wallet) => Boolean(wallet.address));
}

function authResponse(message: string, status: number) {
  return NextResponse.json(
    {
      authorized: false,
      hubRole: null,
      error: message,
    },
    { status }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const authError = verifyInfraRequest(request);
  if (authError) return authError;

  const access = request.nextUrl.searchParams.get('access');
  if (access !== PROPAGATE_ACCESS) {
    return authResponse('Unsupported auth access', 400);
  }

  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);
  const wallet = parseAuthorizedWallets().find(
    (item) => item.address === decodedAddress
  );

  if (!wallet) {
    return authResponse('Wallet not authorized for propagate', 404);
  }

  return NextResponse.json({
    data: {
      authorized: true,
      hubRole: wallet.hubRole,
      address: decodedAddress,
    },
  });
}
