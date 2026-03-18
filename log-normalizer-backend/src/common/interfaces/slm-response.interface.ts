
export interface SLMResponse {
  ocsf: Record<string, any> | null
  confidence: number
  processing_time_ms: number
  decision: 'accept' | 'reject' | 'review'
  breakdown: {
    schema_validity: number;
    field_coverage: number;
    value_consistency: number;
  } | null
  validation_errors: string[] | null
  error: string | null
}

