import { UserRole } from 'generated/prisma/client';

/**
 * Shape attached to `request.user` after a successful authentication.
 *
 * Both JwtStrategy and ApiKeyStrategy resolve to this same shape so any
 * downstream code (controllers, guards, services) can read `req.user`
 * uniformly without caring which scheme authenticated the caller.
 *
 * The `kind` field lets routes that care distinguish (e.g. submitCorrection
 * needs an actual user identity, not a machine API key — it should reject
 * `kind === 'apiKey'`).
 */
export type AuthenticatedPrincipal =
  | {
      kind: 'user';
      userId: string;
      email: string;
      role: UserRole;
    }
  | {
      kind: 'apiKey';
    };

/**
 * Payload signed into the JWT. Keep this minimal — anything in here is
 * read-once at issue time and frozen until the token expires. The role
 * is included so RolesGuard doesn't need a DB lookup on every request.
 */
export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
