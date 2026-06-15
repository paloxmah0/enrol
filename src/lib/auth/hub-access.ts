import { lookupDidForWallet, type HubRole } from './did-lookup';

export type { HubRole };

export type WalletAccessResult =
  | { status: 'authorized'; hubRole: HubRole }
  | { status: 'not_found' }
  | { status: 'unauthorized' };

const SUPPORTED_ACCESS = new Set(['propagate']);

export async function resolveWalletAccess(
  address: string,
  access: string
): Promise<WalletAccessResult> {
  if (!SUPPORTED_ACCESS.has(access)) {
    throw new Error(`Unsupported access scope: ${access}`);
  }

  const lookup = await lookupDidForWallet(address);
  if (!lookup.found) {
    return { status: 'not_found' };
  }

  if (!lookup.hubRole) {
    return { status: 'unauthorized' };
  }

  return { status: 'authorized', hubRole: lookup.hubRole };
}
