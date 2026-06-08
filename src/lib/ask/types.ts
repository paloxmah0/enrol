export type RetrievalPresetName = 'default' | 'enrolment';

export interface RagRequest {
  query: string;
  preset?: RetrievalPresetName;
}

export interface RagResponse {
  answer: string | null;
}
