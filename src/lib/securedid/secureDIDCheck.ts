
// src/lib/did/secureDIDCheck.ts
// Utility: validate stake address, query indexer, validate redirects

import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DIDStatus = "active" | "not_found" | "revoked" | "error";

export interface DIDCheckResult {
  status: DIDStatus;
  did: string | null;
  error: string | null;
  timestamp: number;
}

// ─── Stake address validation ─────────────────────────────────────────────────

/**
 * Cardano stake addresses start with "stake1" (mainnet) or "stake_test1" (preprod/preview).
 * They are bech32 encoded, ~59 chars total.
 */
function isValidStakeAddress(address: unknown): address is string {
  if (typeof address !== "string" || address.length === 0) return false;
  return /^stake(_test)?1[a-z0-9]{50,}$/.test(address);
}

// ─── DID derivation ───────────────────────────────────────────────────────────

function deriveDID(stakeAddress: unknown): string | null {
  try {
    if (!isValidStakeAddress(stakeAddress)) {
      logger.warn("Invalid stake address — cannot derive DID", {
        length: typeof stakeAddress === "string" ? stakeAddress.length : 0,
        prefix: typeof stakeAddress === "string" ? stakeAddress.slice(0, 12) : "",
      });
      return null;
    }
    return `did:cardano:${stakeAddress}`;
  } catch (err) {
    logger.error("DID derivation threw unexpectedly", { err });
    return null;
  }
}

// ─── Indexer URL validation (SSRF guard) ──────────────────────────────────────

const ALLOWED_INDEXER_HOSTNAMES = [
  "prisma-didsindexer-production.up.railway.app",
  "dids-tese-2.onrender.com",  // ← ADD THIS
];

function isIndexerUrlSafe(): boolean {
  const raw = process.env.NEXT_PUBLIC_DID_INDEXER_URL;
  if (!raw) {
    logger.error("NEXT_PUBLIC_DID_INDEXER_URL is not configured");
    return false;
  }

  try {
    const url = new URL(raw);

    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      logger.error("Indexer URL must use HTTPS in production");
      return false;
    }

    const allowed = ALLOWED_INDEXER_HOSTNAMES.some(
      (h) => url.hostname === h || url.hostname.endsWith(`.${h}`)
    );

    if (!allowed && process.env.NODE_ENV === "production") {
      logger.error("Indexer hostname is not whitelisted", {
        hostname: url.hostname,
      });
      return false;
    }

    return true;
  } catch {
    logger.error("Indexer URL is malformed");
    return false;
  }
}

// ─── Indexer query ────────────────────────────────────────────────────────────

async function queryIndexer(did: string): Promise<DIDStatus> {
  if (!isIndexerUrlSafe()) return "error";

  const base = process.env.NEXT_PUBLIC_DID_INDEXER_URL!;
 const url = `${base}/did/${encodeURIComponent(did)}?includeUnconfirmed=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000); // 5 s timeout

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    logger.info("Indexer response", { 
      status: res.status,
      statusText: res.statusText 
    });

    if (res.status === 200) return "active";
    if (res.status === 404) return "not_found";
    if (res.status === 410) return "revoked";

    logger.warn("Unexpected indexer HTTP status", { status: res.status });
    return "error";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.warn("DID indexer request timed out");
    } else {
      logger.error("DID indexer fetch failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public: check DID ────────────────────────────────────────────────────────

/**
 * Check whether the given stake address has an active DID on-chain.
 *
 * @param stakeAddress  Bech32 stake/reward address from the connected wallet
 */
export async function secureCheckDID(
  stakeAddress: unknown
): Promise<DIDCheckResult> {
  const timestamp = Date.now();

  if (!isValidStakeAddress(stakeAddress)) {
    return {
      status: "error",
      did: null,
      error: "Invalid stake address format",
      timestamp,
    };
  }

  const did = deriveDID(stakeAddress);
  if (!did) {
    return {
      status: "error",
      did: null,
      error: "Could not derive DID from stake address",
      timestamp,
    };
  }

  const status = await queryIndexer(did);

  return {
    status,
    did,
    error: status === "error" ? "Failed to check DID status — please retry" : null,
    timestamp,
  };
}

// ─── Public: safe redirect ────────────────────────────────────────────────────

/**
 * Domains allowed as redirect targets.
 * Add your enrol app's production domain here.
 */
const ALLOWED_REDIRECT_HOSTNAMES =
  typeof window !== "undefined"
    ? [
        window.location.hostname, // always allow same origin
        "register.prisma.events",
        "dids-dashboard-production.up.railway.app",
      ]
    : [];

/**
 * Validate that a URL is safe to redirect to (prevents open-redirect attacks).
 * Relative paths (starting with /) are always considered safe.
 */
export function isSafeRedirectUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;

  // Relative paths are safe
  if (url.startsWith("/") && !url.startsWith("//")) return true;

  try {
    const parsed = new URL(url);

    // Only allow http/https
    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    // Check against whitelist
    return ALLOWED_REDIRECT_HOSTNAMES.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

/**
 * Redirect to `url` only if it passes the safety check.
 * Falls back to "/" on failure.
 */
export function safeRedirect(url: unknown): void {
  if (!isSafeRedirectUrl(url)) {
    logger.warn("Blocked unsafe redirect", {
      url: typeof url === "string" ? url.slice(0, 80) : "",
    });
    window.location.href = "/";
    return;
  }
  window.location.href = url;
}
