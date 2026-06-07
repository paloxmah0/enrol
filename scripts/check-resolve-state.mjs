#!/usr/bin/env node
/**
 * Report Neo4j state for the enrolment resolver pipeline.
 *
 * Reads .env.local / .env for NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD.
 *
 * Usage:
 *   pnpm resolve:check
 *   pnpm resolve:check -- --verbose
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

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

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

function statusIcon(hasIssue) {
  return hasIssue ? '⚠' : '✓';
}

function emptyCounts() {
  return { unset: 0, pending: 0, attempted: 0, successful: 0, failed: 0 };
}

function applyStatusCounts(target, records) {
  for (const record of records) {
    const status = record.get('status');
    const count = record.get('count').toNumber();
    if (status == null) {
      target.unset += count;
    } else if (status in target) {
      target[status] += count;
    }
  }
  return target;
}

async function queryResolveStatusCounts(session) {
  const result = await session.run(
    `
    MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
    WHERE c.topic = $topic
    RETURN e.resolveStatus AS status, count(DISTINCT e) AS count
    `,
    { topic: ENROLMENT_TOPIC }
  );
  return applyStatusCounts(emptyCounts(), result.records);
}

const ELIGIBLE_STATUS_PREDICATE =
  '(e.resolveStatus IS NULL OR e.resolveStatus = \'pending\' OR e.resolveStatus = \'failed\')';

async function queryReadyToResolveCount(session) {
  const result = await session.run(
    `
    MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
    WHERE ${ELIGIBLE_STATUS_PREDICATE} AND c.topic = $topic
    OPTIONAL MATCH (e)-[:HAS_VOICE]->(v:Voice)
    WITH e, v
    WHERE v IS NULL OR v.transcription IS NOT NULL
    RETURN count(DISTINCT e) AS count
    `,
    { topic: ENROLMENT_TOPIC }
  );
  return result.records[0].get('count').toNumber();
}

async function queryWaitingOnTranscriptionCount(session) {
  const result = await session.run(
    `
    MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
    WHERE ${ELIGIBLE_STATUS_PREDICATE} AND c.topic = $topic
    MATCH (e)-[:HAS_VOICE]->(v:Voice)
    WHERE v.transcription IS NULL
    RETURN count(DISTINCT e) AS count
    `,
    { topic: ENROLMENT_TOPIC }
  );
  return result.records[0].get('count').toNumber();
}

async function queryOutputNodeCounts(session) {
  const result = await session.run(
    `
    OPTIONAL MATCH (r:Role)
    WITH count(r) AS roles
    OPTIONAL MATCH (snap:RoleSnapshot)
    WITH roles, count(snap) AS snapshots
    OPTIONAL MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
    WHERE c.topic = $topic
    RETURN roles, snapshots, count(DISTINCT e) AS enrolmentEntries
    `,
    { topic: ENROLMENT_TOPIC }
  );
  const record = result.records[0];
  return {
    roles: record.get('roles').toNumber(),
    snapshots: record.get('snapshots').toNumber(),
    enrolmentEntries: record.get('enrolmentEntries').toNumber(),
  };
}

async function queryEntriesWithSnapshots(session) {
  const result = await session.run(
    `
    MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
    WHERE c.topic = $topic
    OPTIONAL MATCH (snap:RoleSnapshot)-[:FOR_ENTRY]->(e)
    RETURN count(DISTINCT e) AS entries, count(DISTINCT snap) AS withSnapshot
    `,
    { topic: ENROLMENT_TOPIC }
  );
  const record = result.records[0];
  return {
    entries: record.get('entries').toNumber(),
    withSnapshot: record.get('withSnapshot').toNumber(),
  };
}

async function queryVoiceStatusCounts(session) {
  const result = await session.run(
    `
    MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
    WHERE c.topic = $topic
    MATCH (e)-[:HAS_VOICE]->(v:Voice)
    RETURN v.processingStatus AS status, count(DISTINCT v) AS count
    `,
    { topic: ENROLMENT_TOPIC }
  );

  const counts = {};
  for (const record of result.records) {
    const status = record.get('status') ?? 'unset';
    counts[status] = record.get('count').toNumber();
  }
  return counts;
}

async function queryEntryDetails(session, whereClause, limit = 10) {
  const result = await session.run(
    `
    MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
    MATCH (e)-[:SENT_BY]->(p:Participant)
    WHERE c.topic = $topic AND ${whereClause}
    OPTIONAL MATCH (e)-[:HAS_VOICE]->(v:Voice)
    OPTIONAL MATCH (snap:RoleSnapshot)-[:FOR_ENTRY]->(e)
    RETURN e.id AS entryId,
           e.resolveStatus AS resolveStatus,
           e.resolveFailureReason AS failureReason,
           p.handle AS participantHandle,
           v.processingStatus AS voiceStatus,
           v.transcription IS NOT NULL AS hasTranscription,
           snap.id AS snapshotId,
           e.date AS entryDate
    ORDER BY e.date
    LIMIT $limit
    `,
    { topic: ENROLMENT_TOPIC, limit: neo4j.int(limit) }
  );

  return result.records.map((record) => ({
    entryId: record.get('entryId'),
    resolveStatus: record.get('resolveStatus'),
    failureReason: record.get('failureReason'),
    participantHandle: record.get('participantHandle'),
    voiceStatus: record.get('voiceStatus'),
    hasTranscription: record.get('hasTranscription'),
    snapshotId: record.get('snapshotId'),
    entryDate: record.get('entryDate'),
  }));
}

function printCountsLine(label, counts) {
  console.log(
    `  ${label}: unset=${counts.unset}, pending=${counts.pending}, ` +
      `attempted=${counts.attempted}, successful=${counts.successful}, failed=${counts.failed}`
  );
}

function printEntryList(title, entries) {
  if (entries.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const entry of entries) {
    const parts = [
      entry.entryId,
      `status=${entry.resolveStatus ?? 'unset'}`,
      `participant=${entry.participantHandle}`,
    ];
    if (entry.voiceStatus) {
      parts.push(`voice=${entry.voiceStatus}`);
      parts.push(`transcribed=${entry.hasTranscription ? 'yes' : 'no'}`);
    }
    if (entry.failureReason) {
      parts.push(`reason=${entry.failureReason}`);
    }
    if (entry.snapshotId) {
      parts.push(`snapshot=${entry.snapshotId}`);
    }
    console.log(`  - ${parts.join('  ')}`);
  }
}

async function main() {
  const { uri, user, password } = resolveNeo4jCredentials();
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    encrypted: 'ENCRYPTION_OFF',
  });

  try {
    await driver.verifyConnectivity();
    const session = driver.session({ database: 'neo4j' });

    try {
      const resolveCounts = await queryResolveStatusCounts(session);
      const readyToResolve = await queryReadyToResolveCount(session);
      const waitingOnTranscription = await queryWaitingOnTranscriptionCount(session);
      const outputCounts = await queryOutputNodeCounts(session);
      const snapshotCoverage = await queryEntriesWithSnapshots(session);
      const voiceCounts = await queryVoiceStatusCounts(session);

      const hasBacklog = readyToResolve > 0;
      const hasFailures = resolveCounts.failed > 0;
      const hasStuck = resolveCounts.attempted > 0;

      console.log('Enrolment resolver — Neo4j state');
      console.log('════════════════════════════════════════════');
      console.log(`Topic: ${ENROLMENT_TOPIC}`);
      console.log('');

      console.log('Output nodes');
      console.log('────────────────────────────────────────────');
      console.log(`  Roles:              ${outputCounts.roles}`);
      console.log(`  RoleSnapshots:      ${outputCounts.snapshots}`);
      console.log(
        `  Entries w/ snapshot: ${snapshotCoverage.withSnapshot} / ${snapshotCoverage.entries}`
      );
      console.log('');

      console.log('Entry resolveStatus (_botEnrolment)');
      console.log('────────────────────────────────────────────');
      printCountsLine('counts', resolveCounts);
      console.log(
        `${statusIcon(hasBacklog)}  Ready to resolve:     ${readyToResolve}  (unset/pending/failed + voice gate passed)`
      );
      console.log(
        `${statusIcon(waitingOnTranscription > 0)}  Waiting transcription: ${waitingOnTranscription}`
      );
      console.log(
        `${statusIcon(hasStuck)}  Attempted (in-flight): ${resolveCounts.attempted}`
      );
      console.log(`${statusIcon(hasFailures)}  Failed:               ${resolveCounts.failed}`);
      console.log('');

      const voiceKeys = Object.keys(voiceCounts);
      if (voiceKeys.length > 0) {
        console.log('Voice.processingStatus (_botEnrolment entries with voice)');
        console.log('────────────────────────────────────────────');
        for (const status of voiceKeys.sort()) {
          console.log(`  ${status}: ${voiceCounts[status]}`);
        }
        console.log('');
      }

      if (verbose) {
        const ready = await queryEntryDetails(
          session,
          `${ELIGIBLE_STATUS_PREDICATE} AND (NOT (e)-[:HAS_VOICE]->(:Voice) OR EXISTS { MATCH (e)-[:HAS_VOICE]->(v:Voice) WHERE v.transcription IS NOT NULL })`,
          20
        );
        const waiting = await queryEntryDetails(
          session,
          `${ELIGIBLE_STATUS_PREDICATE} AND EXISTS { MATCH (e)-[:HAS_VOICE]->(v:Voice) WHERE v.transcription IS NULL }`,
          20
        );
        const failed = await queryEntryDetails(session, `e.resolveStatus = 'failed'`, 20);
        const attempted = await queryEntryDetails(session, `e.resolveStatus = 'attempted'`, 20);

        console.log('Ready entries');
        console.log('────────────────────────────────────────────');
        printEntryList('ready', ready);
        console.log('');

        console.log('Waiting on transcription');
        console.log('────────────────────────────────────────────');
        printEntryList('waiting', waiting);
        console.log('');

        console.log('Failed entries');
        console.log('────────────────────────────────────────────');
        printEntryList('failed', failed);
        console.log('');

        console.log('Attempted entries');
        console.log('────────────────────────────────────────────');
        printEntryList('attempted', attempted);
        console.log('');
      } else {
        console.log('Tip: run with --verbose to list entry ids and failure reasons.');
      }

      if (hasBacklog) {
        console.log('Next: pnpm resolve:backlog');
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
