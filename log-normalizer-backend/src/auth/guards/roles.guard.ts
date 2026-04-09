import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'generated/prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedPrincipal } from '../auth.types';

/**
 * Reads the @Roles(...) metadata off the route handler and rejects any
 * request whose principal does not match. Must run AFTER an auth guard
 * (JwtAuthGuard or JwtOrApiKeyAuthGuard) — it assumes `request.user`
 * already exists.
 *
 * If the route has no @Roles decorator, the guard is a no-op (any
 * authenticated principal passes).
 *
 * API key principals (kind: 'apiKey') are rejected for any role-gated
 * route — machine identities have no role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const principal = context.switchToHttp().getRequest().user as
      | AuthenticatedPrincipal
      | undefined;

    if (!principal || principal.kind !== 'user') {
      throw new ForbiddenException(
        'This route requires a user account, not an API key',
      );
    }

    if (!required.includes(principal.role)) {
      throw new ForbiddenException(
        `Requires role(s): ${required.join(', ')}`,
      );
    }

    return true;
  }
}
