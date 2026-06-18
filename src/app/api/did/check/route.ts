import { NextResponse } from "next/server";
import { secureCheckDID } from "@/lib/securedid/secureDIDCheck";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  console.log("RAW URL:", process.env.NEXT_PUBLIC_DID_INDEXER_URL);
  console.log("NODE_ENV:", process.env.NODE_ENV);

  try {
    const body = await request.json();
    const stakeAddress = body?.stakeAddress;

    if (!stakeAddress) {
      return NextResponse.json(
        { status: "error", did: null, error: "Missing stake address", timestamp: Date.now() },
        { status: 400 }
      );
    }

    const result = await secureCheckDID(stakeAddress);
    console.log("DID result:", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("DID check exception", { message });
    return NextResponse.json(
      { status: "error", did: null, error: "Unable to check DID status", timestamp: Date.now() },
      { status: 400 }
    );
  }
}
