import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { User, UserRole } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { JwtPayload } from './auth.types';

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024, // 19 MiB — OWASP minimum for argon2id (2024)
  timeCost: 2,
  parallelism: 1,
};

/**
 * Authentication primitives:
 *  - hashing/verifying passwords (argon2id)
 *  - validating credentials against the User table
 *  - issuing JWTs
 *  - resolving a JWT payload to a current User row (used by JwtStrategy)
 *
 * No HTTP concerns here. Controllers, guards, and strategies are the
 * only callers.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── password hashing ────────────────────────────────────────────────────

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTS);
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Malformed hash or any verify-side error → fail closed.
      return false;
    }
  }

  // ── login flow ──────────────────────────────────────────────────────────

  /**
   * Validates email + password against the User table. Throws
   * UnauthorizedException on any failure (wrong email, wrong password,
   * malformed hash) — we deliberately do NOT distinguish between
   * "no such user" and "wrong password" to avoid user enumeration.
   *
   * On success, bumps lastLoginAt and returns the user row.
   */
  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Even if the user is missing, run a dummy verify to keep the
    // request timing constant. Cheap defense against user enumeration
    // via timing side channels.
    if (!user) {
      await argon2.hash('dummy-to-equalize-timing', ARGON2_OPTS).catch(() => undefined);
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await this.verifyPassword(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log({ userId: user.id, email: user.email }, 'auth.login');
    return user;
  }

  // ── token issue / verify ────────────────────────────────────────────────

  signToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }

  /**
   * Used by JwtStrategy.validate(). Re-reads the user from the DB so
   * deletions/role changes take effect on the next request without
   * waiting for token expiry.
   *
   * Returns null if the user no longer exists — JwtStrategy maps that
   * to UnauthorizedException.
   */
  async resolvePrincipalFromJwt(payload: JwtPayload): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    return user ?? null;
  }

  // ── helpers for tests/seed ──────────────────────────────────────────────

  async createUser(input: {
    email: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    const passwordHash = await this.hashPassword(input.password);
    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
      },
    });
  }
}
