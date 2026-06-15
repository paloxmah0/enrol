# Enrol (register.prisma.events)

Next.js app for Prisma ID registration and enrolment.

## Wallet auth API (propagate CLI)

Infra-authenticated endpoint used by propagate to authorize wallet addresses:

```
GET /api/auth/{address}?access=propagate
Authorization: Bearer <PRIVATE_API_TOKEN>
```

### Response (V1 stub)

```json
{
  "data": {
    "address": "addr_test1...",
    "authorized": true,
    "hubRole": "OWNER"
  }
}
```

**V1 stub:** always returns `authorized: true` with `hubRole: OWNER`. Future versions will add `@prisma-events/dids-sdk`, derive the DID from the wallet address, and look up the DID in the indexer to determine `hubRole`.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `PRIVATE_API_TOKEN` | Validates inbound infra API requests |
| `PROPAGATE_AUTH_ACCESS` | Expected `access` query param (default `propagate`) |
| `DID_INDEXER_ENDPOINT` | Future: DID indexer base URL |

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

## Deploy on Vercel

Deployed to **register.prisma.events**. Set `PRIVATE_API_TOKEN` in Vercel env vars.
