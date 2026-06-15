export type HubRole = 'OWNER' | 'MEMBER';

export interface DidLookupResult {
  found: boolean;
  did?: string;
  hubRole?: HubRole;
}

/**
 * Resolve wallet address to a registered DID and hub role.
 *
 * V1 stub: always returns found with OWNER.
 * V2: deriveStakeAddressFromBaseAddress → deriveDID → GET DID_INDEXER_ENDPOINT/did/{did}
 */
export async function lookupDidForWallet(address: string): Promise<DidLookupResult> {
  void address;
  // TODO: use @prisma-events/dids-sdk derive + DID indexer lookup
  return { found: true, hubRole: 'OWNER' };
}
