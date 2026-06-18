"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";

type CardanoWalletApi = {
  getRewardAddresses(): Promise<string[]>;
};

type CardanoWallet = {
  name?: string;
  icon?: string;
  apiVersion?: string;
  enable(): Promise<CardanoWalletApi>;
};

type CardanoWindow = Record<string, CardanoWallet | undefined>;

declare global {
  interface Window {
    Tally?: { loadEmbeds: () => void };
    cardano?: CardanoWindow;
  }
}

type WalletInfo = {
  key: string;
  name: string;
  icon: string;
};

type DIDCheckResult = {
  status: "active" | "not_found" | "revoked" | "error";
  did: string | null;
  error: string | null;
};

const DID_APP_URL =
  process.env.NEXT_PUBLIC_DID_APP_URL ||
  "https://dids-dashboard-production.up.railway.app";

const KNOWN_WALLETS = [
  "eternl",
  "nami",
  "lace",
  "flint",
  "yoroi",
  "typhon",
  "gerowallet",
  "nufi",
];

const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(values: number[]) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;

  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;

    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= generators[i];
    }
  }

  return chk;
}

function expandHrp(hrp: string) {
  const expanded: number[] = [];
  for (let i = 0; i < hrp.length; i += 1) expanded.push(hrp.charCodeAt(i) >> 5);
  expanded.push(0);
  for (let i = 0; i < hrp.length; i += 1) expanded.push(hrp.charCodeAt(i) & 31);
  return expanded;
}

function convertBits(data: number[], fromBits: number, toBits: number) {
  let acc = 0;
  let bits = 0;
  const maxv = (1 << toBits) - 1;
  const converted: number[] = [];

  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) throw new Error("Invalid address bytes");
    acc = (acc << fromBits) | value;
    bits += fromBits;

    while (bits >= toBits) {
      bits -= toBits;
      converted.push((acc >> bits) & maxv);
    }
  }

  if (bits > 0) converted.push((acc << (toBits - bits)) & maxv);
  return converted;
}

function bech32Encode(hrp: string, data: number[]) {
  const values = [...expandHrp(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, index) => (mod >> (5 * (5 - index))) & 31);
  return `${hrp}1${[...data, ...checksum].map((value) => BECH32_ALPHABET[value]).join("")}`;
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Wallet returned an invalid stake address");
  }

  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

function rewardAddressHexToBech32(hexAddress: string) {
  const bytes = hexToBytes(hexAddress);
  if (bytes.length < 2) throw new Error("Wallet did not return a usable stake address");

  const networkId = bytes[0] & 0x0f;
  const prefix = networkId === 1 ? "stake" : "stake_test";
  return bech32Encode(prefix, convertBits(bytes, 8, 5));
}

function buildReturnToUrl(formID: string) {
  const url = new URL("/register", window.location.origin);
  url.searchParams.set("type", formID);
  url.searchParams.set("did", "true");
  return url.toString();
}

async function checkDIDForStakeAddress(stakeAddress: string) {
  const response = await fetch("/api/did/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stakeAddress }),
  });

  if (!response.ok) throw new Error("Could not check DID status");
  return (await response.json()) as DIDCheckResult;
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const formID = searchParams.get("type") || "default";
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [verifiedDID, setVerifiedDID] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scanWallets = useCallback(() => {
    const cardano = window.cardano;
    if (!cardano) {
      setWallets([]);
      setError("No Cardano wallet was detected in this browser.");
      return;
    }

    const found = new Map<string, WalletInfo>();

    for (const key of KNOWN_WALLETS) {
      const wallet = cardano[key];
      if (wallet?.enable) {
        found.set(key, {
          key,
          name: wallet.name || key,
          icon: wallet.icon || "",
        });
      }
    }

    for (const key of Object.keys(cardano)) {
      const wallet = cardano[key];
      if (!wallet?.enable || found.has(key)) continue;
      found.set(key, {
        key,
        name: wallet.name || key,
        icon: wallet.icon || "",
      });
    }

    const detectedWallets = [...found.values()];
    setWallets(detectedWallets);
    if (detectedWallets.length > 0) {
      setError(null);
    } else {
      setError("No Cardano wallet was detected in this browser.");
    }
  }, []);

  const didUrl = useMemo(() => {
    if (typeof window === "undefined") return DID_APP_URL;
    return `${DID_APP_URL}?returnTo=${encodeURIComponent(buildReturnToUrl(formID))}`;
  }, [formID]);

  useEffect(() => {
    if (window.Tally) window.Tally.loadEmbeds();
  });

  useEffect(() => {
    scanWallets();
    const timeout = window.setTimeout(scanWallets, 1000);
    return () => window.clearTimeout(timeout);
  }, [scanWallets]);

  const connectAndVerify = async (walletInfo: WalletInfo) => {
    setIsConnecting(true);
    setError(null);
    setMessage("Checking your wallet DID...");

    try {
      const cardano = window.cardano;
      const wallet = cardano?.[walletInfo.key];
      if (!wallet) throw new Error("Wallet not found");

      const api = await wallet.enable();
      const rewardAddresses = await api.getRewardAddresses();
      if (!rewardAddresses?.length) {
        throw new Error("No stake address was found in this wallet");
      }

      const stakeAddress = rewardAddressHexToBech32(rewardAddresses[0]);
      const result = await checkDIDForStakeAddress(stakeAddress);

      if (result.status === "active" && result.did) {
        setVerifiedDID(result.did);
        setMessage("DID verified. Loading registration...");
        const url = new URL(window.location.href);
        url.searchParams.set("type", formID);
        url.searchParams.set("did", "true");
        window.history.replaceState(null, "", url.toString());
        return;
      }

      if (result.status === "revoked") {
        throw new Error("This wallet's DID is revoked. Please create or update your DID first.");
      }

      if (result.status === "not_found") {
        throw new Error("No active DID was found for this wallet. Please create one first.");
      }

      throw new Error(result.error || "DID check failed. Please retry.");
    } catch (err) {
      setVerifiedDID(null);
      setMessage(null);
      setError(err instanceof Error ? err.message : "Unable to verify this wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  if (!verifiedDID) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "#0a0a0a" }}>
        <div style={{ maxWidth: "460px", width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "8px", color: "#ffffff" }}>
            Confirm your DID
          </h1>
          
          <p style={{ color: "#9ca3af", marginBottom: "8px" }}>
  Verify your DID with your Cardano wallet
</p>
          <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "24px" }}>
            If no DID is found, create one and you will be sent straight back here.
          </p>

          {error && (
            <div role="alert" style={{ background: "#3f1d1d", border: "1px solid #7f1d1d", color: "#fecaca", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "14px" }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ background: "#172554", border: "1px solid #1d4ed8", color: "#bfdbfe", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "14px" }}>
              {message}
            </div>
          )}

          <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
            {wallets.map((wallet) => (
              <button
                key={wallet.key}
                type="button"
                onClick={() => connectAndVerify(wallet)}
                disabled={isConnecting}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", background: "#111827", color: "#ffffff", border: "1px solid #374151", padding: "12px 16px", borderRadius: "8px", fontWeight: 500, cursor: isConnecting ? "not-allowed" : "pointer", opacity: isConnecting ? 0.65 : 1 }}
              >
                {wallet.icon && <img src={wallet.icon} alt="" style={{ width: "22px", height: "22px", borderRadius: "4px" }} />}
                {isConnecting ? "Checking..." : `Connect ${wallet.name}`}
              </button>
            ))}
          </div>

          {wallets.length === 0 && (
            <div style={{ marginBottom: "18px" }}>
              <p style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "10px" }}>
                Open this page in Chrome or another browser where your Cardano wallet extension is installed and enabled.
              </p>
              <button
                type="button"
                onClick={scanWallets}
                style={{ background: "#111827", color: "#ffffff", border: "1px solid #374151", padding: "10px 16px", borderRadius: "8px", fontWeight: 500, cursor: "pointer" }}
              >
                Check for wallet
              </button>
            </div>
          )}

          <a href={didUrl} style={{ display: "block", background: "#2563eb", color: "#fff", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontWeight: 500 }}>
            Create your DID
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0a0a0a" }}>
      <Script
        src="https://tally.so/widgets/embed.js"
        strategy="lazyOnload"
        onLoad={() => {
          if (window.Tally) window.Tally.loadEmbeds();
        }}
      />
      <iframe
        suppressHydrationWarning
        data-tally-src={`https://tally.so/r/${formID}`}
        width="100%"
        height="100%"
        style={{ border: "none", minHeight: "100vh" }}
      ></iframe>
    </div>
  );
}

export default function Register() {
  return (
    <Suspense fallback={<div style={{ background: "#0a0a0a", minHeight: "100vh" }}></div>}>
      <RegisterContent />
    </Suspense>
  );
}
