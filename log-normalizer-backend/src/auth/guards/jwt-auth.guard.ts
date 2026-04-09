import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Requires a valid JWT (cookie or Authorization header). Used for
 * human-only endpoints: retry, review, metrics, /auth/me, /auth/logout.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
