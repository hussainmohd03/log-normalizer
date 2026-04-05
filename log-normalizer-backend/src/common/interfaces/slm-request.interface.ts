export interface SLMRequest {
  raw_log: string | Record<string, any>;
  source: string;
  format: string | null;
}
