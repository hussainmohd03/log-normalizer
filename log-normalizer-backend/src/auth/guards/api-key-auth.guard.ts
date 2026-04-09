import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Requires a valid `x-api-key` header. Used for machine-only endpoints
 * (the ingestion routes today).
 */
@Injectable()
export class ApiKeyAuthGuard extends AuthGuard('api-key') {}
