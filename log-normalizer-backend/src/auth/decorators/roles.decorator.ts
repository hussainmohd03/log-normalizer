import { SetMetadata } from '@nestjs/common';
import { UserRole } from 'generated/prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to one or more user roles. Must be used together
 * with JwtAuthGuard (or JwtOrApiKeyAuthGuard) AND RolesGuard, e.g.:
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles(UserRole.ADMIN)
 *   @Post('reconciliation/run')
 *   ...
 *
 * If the request authenticated via API key (no role), RolesGuard rejects
 * it with 403 — API keys are machine identities and have no role.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
