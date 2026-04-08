import { Prisma } from 'generated/prisma/client'

export interface SLMRequest {
  raw_log: Prisma.JsonValue
  source: string
  format: string | null
}