import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Accepts either a JWT cookie/Bearer or an `x-api-key` header. Used for
 * read-side endpoints (`GET /normalize/jobs/:id`, the SSE stream) so a
 * machine client can poll job status without needing a user account.
 *
 * Passport tries the strategies in order; the first that succeeds wins.
 * If both fail, it raises the last error (typically the api-key one).
 */
@Injectable()
export class JwtOrApiKeyAuthGuard extends AuthGuard(['jwt', 'api-key']) {}
