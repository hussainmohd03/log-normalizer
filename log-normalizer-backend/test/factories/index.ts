import { Prisma, RawLog, STATUS } from "generated/prisma/browser";
import { SLMResponse } from "src/common/interfaces/slm-response.interface";

export function buildRawLog(overrides: Partial<Prisma.RawLogCreateInput> = {}): Prisma.RawLogCreateInput {
  return {
    source: 'crowdstrike',
    rawContent: { alert_id: 'test-123', severity: 'high' },
    status: STATUS.PENDING,
    format: 'json',
    ...overrides,
  }
}

export function buildSLMResponse(overrides: Partial<SLMResponse> = {}): SLMResponse {
  return {
    ocsf: {
      class_uid: 2004,
      class_name: 'Detection Finding',
      activity_id: 1,
      activity_name: 'Create',
      severity_id: 3,
      type_uid: 200401,
      finding_info: { title: 'Test Alert', uid: 'test-uid' },
      metadata: { product: { name: 'Falcon', vendor_name: 'CrowdStrike' }, version: '1.1.0' },
      time: new Date().toISOString(),
    },
    confidence: 0.92,
    decision: 'accept',
    processing_time_ms: 150,
    breakdown: { schema_validity: 1.0, field_coverage: 0.85, value_consistency: 0.9 },
    validation_errors: [],
    error: null,
    ...overrides,
  }
}
