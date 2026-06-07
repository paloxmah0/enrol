import { logger } from '@/lib/logger';
import type { ProtocolChannelPayload } from '@/lib/docs/types';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function validateProtocolPayload(
  channel: string,
  body: unknown
): ProtocolChannelPayload {
  if (body == null || typeof body !== 'object') {
    throw new Error(`protocol_invalid: ${channel}`);
  }

  const payload = body as Partial<ProtocolChannelPayload>;
  if (!payload.domain?.trim()) {
    throw new Error(`protocol_missing_domain: ${channel}`);
  }
  if (!payload.version?.trim()) {
    throw new Error(`protocol_missing_version: ${channel}`);
  }
  if (!payload.commitSha?.trim()) {
    throw new Error(`protocol_missing_commitSha: ${channel}`);
  }
  if (!payload.nodes || typeof payload.nodes !== 'object') {
    throw new Error(`protocol_missing_nodes: ${channel}`);
  }
  if (Object.keys(payload.nodes).length === 0) {
    throw new Error(`schema_not_found: ${channel}`);
  }
  if (!payload.subgraph?.relationships?.length) {
    throw new Error(`protocol_missing_subgraph: ${channel}`);
  }

  for (const [nodeKey, node] of Object.entries(payload.nodes)) {
    if (!node?.schema || typeof node.schema !== 'object') {
      throw new Error(`protocol_invalid_node_schema: ${channel}/${nodeKey}`);
    }
    if (!node.commitSha?.trim()) {
      throw new Error(`protocol_missing_node_commitSha: ${channel}/${nodeKey}`);
    }
  }

  return payload as ProtocolChannelPayload;
}

/** Protocol channel payload from docs GET /api/protocol/{channel}. */
export async function fetchProtocolChannel(
  channel: string
): Promise<ProtocolChannelPayload> {
  const docsAppUrl = requireEnv('DOCS_APP_URL').replace(/\/$/, '');
  const token = requireEnv('PRIVATE_API_TOKEN');

  const url = `${docsAppUrl}/api/protocol/${encodeURIComponent(channel)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) {
    throw new Error(`schema_not_found: ${channel}`);
  }

  if (!res.ok) {
    throw new Error(`protocol schema failed for ${channel}: ${res.status}`);
  }

  const body = await res.json();
  const payload = validateProtocolPayload(channel, body);

  logger.info('Fetched protocol channel', {
    channel,
    domain: payload.domain,
    version: payload.version,
    commitSha: payload.commitSha,
    nodeKeys: Object.keys(payload.nodes),
  });

  return payload;
}
