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

export interface EntryResolveResult {
  entryId: string;
  handler?: ResolveHandlerName;
  resolveStatus: ResolveStatus;
}

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
