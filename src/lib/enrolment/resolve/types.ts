import type { ProtocolChannelPayload } from '@/lib/docs/types';

export type ResolveHandlerName = 'enrolment';

export type ResolveStatus = 'pending' | 'attempted' | 'successful' | 'failed';

export interface ResolveContext {
  entryId: string;
  topic: string;
  handler: ResolveHandlerName;
  participantHandle: string;
  transcription?: string;
  textContent?: string;
}

export type ResolveSkipReason =
  | 'not_role_enrolment'
  | 'voice_not_ready'
  | 'entry_not_found'
  | 'unsupported_topic';

export type EntryResolveResult =
  | {
      entryId: string;
      handler: ResolveHandlerName;
      resolveStatus: ResolveStatus;
    }
  | {
      entryId: string;
      status: 'skipped';
      reason: ResolveSkipReason;
    };

export type EntrySourceKind = 'voice' | 'text';

export type ExtractedProtocolFields = Record<string, Record<string, unknown>>;

export interface SchemaResolveResult {
  protocol: ProtocolChannelPayload;
  schemaChannel: string;
  extractedByNode: ExtractedProtocolFields;
  sourceText: string;
  sourceKind: EntrySourceKind;
}

export interface EntryTelegramRef {
  messageId: number;
  chatId: number;
}

export interface ResolveStatusCounts {
  unset: number;
  pending: number;
  attempted: number;
  successful: number;
  failed: number;
}

export interface BacklogResolveResult {
  status: 'success' | 'idle';
  entryId?: string;
  result?: EntryResolveResult;
  outstanding: number;
  hasMore: boolean;
  counts: ResolveStatusCounts;
}
