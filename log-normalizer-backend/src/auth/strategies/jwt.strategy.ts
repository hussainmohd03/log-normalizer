import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { AuthenticatedPrincipal, JwtPayload } from '../auth.types';

/**
 * Reads the JWT from an httpOnly `auth_token` cookie set by the login
 * endpoint. Falls back to the `Authorization: Bearer <token>` header
 * for machine clients or curl during dev — the cookie path is the
 * primary one for the React UI.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['auth_token'] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Passport calls this after verifying the signature/expiry. We re-read
   * the user from the DB so deleted accounts and role changes take effect
   * within one request, not at token expiry.
   *
   * Whatever this returns becomes `request.user`.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    const user = await this.authService.resolvePrincipalFromJwt(payload);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return {
      kind: 'user',
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
