import type { ProtocolChannelPayload } from '@/lib/docs/types';
import type { ExtractedProtocolFields } from '../types';
import OpenAI from 'openai';

export const ENROLMENT_EXTRACTION_NODE = 'role_snapshot' as const;

const DEFAULT_EXTRACT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT =
  'You extract structured data from a transcript using a single schema. ' +
  'Return a JSON object matching the schema field names. Use null for missing values.';

function getExtractModel(): string {
  return process.env.OPENAI_EXTRACT_MODEL?.trim() || DEFAULT_EXTRACT_MODEL;
}

function getRoleSnapshotSchema(protocol: ProtocolChannelPayload): Record<string, unknown> {
  const node = protocol.nodes[ENROLMENT_EXTRACTION_NODE];
  if (!node?.schema || typeof node.schema !== 'object') {
    throw new Error(`schema_not_found: ${ENROLMENT_EXTRACTION_NODE}`);
  }
  return node.schema;
}

function parseRoleSnapshotFields(parsed: unknown): Record<string, unknown> {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('openai_extract_not_object');
  }

  const record = parsed as Record<string, unknown>;
  const fields =
    record[ENROLMENT_EXTRACTION_NODE] != null &&
    typeof record[ENROLMENT_EXTRACTION_NODE] === 'object' &&
    !Array.isArray(record[ENROLMENT_EXTRACTION_NODE])
      ? (record[ENROLMENT_EXTRACTION_NODE] as Record<string, unknown>)
      : record;

  if (Object.keys(fields).length === 0) {
    throw new Error('openai_extract_empty_object');
  }

  return fields;
}

/** Extract role_snapshot schema fields from entry source text. */
export async function extractRoleSnapshotFields(
  protocol: ProtocolChannelPayload,
  sourceText: string
): Promise<ExtractedProtocolFields> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const schemaJson = JSON.stringify(getRoleSnapshotSchema(protocol), null, 2);
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: getExtractModel(),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Schema:\n${schemaJson}\n\nText:\n${sourceText}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw?.trim()) {
    throw new Error('openai_extract_empty_response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('openai_extract_invalid_json');
  }

  return { [ENROLMENT_EXTRACTION_NODE]: parseRoleSnapshotFields(parsed) };
}
