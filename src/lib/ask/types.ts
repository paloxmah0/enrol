export type RetrievalPresetName = 'default' | 'enrolment';

export interface RagQuestionMetadata {
  telegramChat: string | number;
  topic?: string | null;
  processingMessageId: number;
  messageThreadId?: number;
  callbackUrl: string;
}

export interface RagRequest {
  query: string;
  preset?: RetrievalPresetName;
  metadata?: RagQuestionMetadata;
}

export interface RagCallbackPayload {
  telegramChat: string | number;
  processingMessageId: number;
  messageThreadId?: number;
  answer: string;
  error?: string;
}

export interface RagResponse {
  answer: string | null;
}

export interface RagAcceptedResponse {
  status: 'accepted';
}
