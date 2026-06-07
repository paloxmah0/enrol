#!/usr/bin/env node
/**
 * Drain the enrol resolve backlog from your local machine.
 *
 * Queries Neo4j for retryable _botEnrolment entries (unset/pending/failed), then POSTs each entryId
 * to production: /api/webhook/resolve?entryId=...
 *
 * Required env (or .env.local in project root):
 *   ENROL_APP_URL
 *   PRIVATE_API_TOKEN
 *   NEO4J_URI
 *   NEO4J_PASSWORD
 *
 * Optional:
 *   NEO4J_USERNAME (default: neo4j)
 *   RESOLVE_BACKLOG_DELAY_MS  pause between entries (default 2000)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const ENROLMENT_TOPIC = '_botEnrolment';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(projectRoot, '.env.local'));
loadEnvFile(path.join(projectRoot, '.env'));

const baseUrl = process.env.ENROL_APP_URL?.replace(/\/$/, '');
const token = process.env.PRIVATE_API_TOKEN;
const delayMs = Number(process.env.RESOLVE_BACKLOG_DELAY_MS ?? 2000);

const ELIGIBLE_STATUS_PREDICATE =
  '(e.resolveStatus IS NULL OR e.resolveStatus = \'pending\' OR e.resolveStatus = \'failed\')';

const PENDING_PICK_CYPHER = `
  MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
  WHERE ${ELIGIBLE_STATUS_PREDICATE} AND c.topic = $topic
  OPTIONAL MATCH (e)-[:HAS_VOICE]->(v:Voice)
  WITH e, v
  WHERE v IS NULL OR v.transcription IS NOT NULL
  WITH DISTINCT e
  ORDER BY e.date
  RETURN e.id AS entryId
  LIMIT 1
`;

const MARK_ATTEMPTED_CYPHER = `
  MATCH (e:Entry { id: $entryId })
  WHERE e.resolveStatus IS NULL OR e.resolveStatus = 'pending' OR e.resolveStatus = 'failed'
  SET e.resolveStatus = 'attempted',
      e.resolveAttemptedAt = datetime(),
      e.resolveFailureReason = null
  RETURN e.id AS entryId
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage() {
  console.error('Usage: pnpm resolve:backlog');
  console.error('Requires ENROL_APP_URL, PRIVATE_API_TOKEN, NEO4J_URI, NEO4J_PASSWORD');
  process.exit(1);
}

function resolveNeo4jCredentials() {
  const uri = process.env.NEO4J_URI ?? process.env.RAILWAY_NEO4J_ENDPOINT;
  const user = process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j';
  const password = process.env.NEO4J_PASSWORD ?? process.env.RAILWAY_NEO4J_DB_PASSWORD;

  if (!uri) {
    throw new Error('Missing NEO4J_URI (or RAILWAY_NEO4J_ENDPOINT) in .env.local');
  }
  if (!password) {
    throw new Error('Missing NEO4J_PASSWORD (or RAILWAY_NEO4J_DB_PASSWORD) in .env.local');
  }

  return { uri, user, password };
}

async function pickNextPendingEntry(session) {
  const result = await session.run(PENDING_PICK_CYPHER, { topic: ENROLMENT_TOPIC });
  if (result.records.length === 0) return null;
  return result.records[0].get('entryId');
}

async function markAttempted(session, entryId) {
  const result = await session.run(MARK_ATTEMPTED_CYPHER, { entryId });
  return result.records.length > 0;
}

async function resolveEntry(entryId, iteration) {
  const url = `${baseUrl}/api/webhook/resolve?entryId=${encodeURIComponent(entryId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status} for entry ${entryId}`);
  }

  console.log(`[${iteration}]`, JSON.stringify({ entryId, ...body }, null, 2));
  return body;
}

async function main() {
  if (!baseUrl || !token) {
    usage();
  }

  const { uri, user, password } = resolveNeo4jCredentials();
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    encrypted: 'ENCRYPTION_OFF',
  });

  try {
    await driver.verifyConnectivity();
    console.log('Neo4j connected.');

    const session = driver.session({ database: 'neo4j' });
    let iteration = 0;

    try {
      while (true) {
        const entryId = await pickNextPendingEntry(session);
        if (!entryId) {
          console.log(
            'Backlog drained — no eligible _botEnrolment entries (unset/pending/failed + voice gate).'
          );
          break;
        }

        const marked = await markAttempted(session, entryId);
        if (!marked) {
          console.warn(`Skipped ${entryId} (no longer unset/pending/failed).`);
          continue;
        }

        iteration += 1;
        await resolveEntry(entryId, iteration);

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
