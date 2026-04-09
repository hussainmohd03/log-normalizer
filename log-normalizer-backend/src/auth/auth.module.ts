import { Global, Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UserRole } from 'generated/prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtOrApiKeyAuthGuard } from './guards/jwt-or-api-key-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Global so guards and decorators are usable from any controller without
 * importing AuthModule everywhere.
 *
 * The bootstrap admin seed runs on module init: if BOOTSTRAP_ADMIN_EMAIL
 * + BOOTSTRAP_ADMIN_PASSWORD are set in env AND no admin exists yet, it
 * inserts one. Idempotent — re-running has no effect.
 */
@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: `${parseInt(config.get<string>('JWT_TTL_HOURS') ?? '') || 24}h`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    ApiKeyStrategy,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    JwtOrApiKeyAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    JwtOrApiKeyAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('BOOTSTRAP_ADMIN_EMAIL');
    const password = this.config.get<string>('BOOTSTRAP_ADMIN_PASSWORD');

    if (!email || !password) {
      return;
    }

    // Use the AuthService directly so we go through the same hashing path
    // as a real signup. Idempotency check: skip if the email already exists.
    try {
      await this.authService.createUser({
        email,
        password,
        role: UserRole.ADMIN,
      });
      this.logger.log({ email }, 'auth.bootstrap_admin_created');
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Email already exists — bootstrap is idempotent.
        return;
      }
      this.logger.error(
        { err: err?.message },
        'auth.bootstrap_admin_failed',
      );
    }
  }
}
