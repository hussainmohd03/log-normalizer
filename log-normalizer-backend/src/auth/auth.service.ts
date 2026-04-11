import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { User, UserRole } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { JwtPayload } from './auth.types';

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTS);
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Constant-time dummy hash so missing-user and wrong-password
    // requests take the same wall time. Defends against user enumeration.
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

  signToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }

  // Re-reads the user so deletions and role changes take effect on the
  // next request without waiting for token expiry.
  async resolvePrincipalFromJwt(payload: JwtPayload): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    return user ?? null;
  }

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
