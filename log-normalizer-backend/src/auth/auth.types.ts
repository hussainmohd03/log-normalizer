import { UserRole } from 'generated/prisma/client';

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

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
