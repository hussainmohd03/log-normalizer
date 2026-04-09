import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedPrincipal } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const COOKIE_NAME = 'auth_token';

/**
 * Auth-facing endpoints:
 *  - POST /auth/login   (open)        — sets the auth_token cookie
 *  - POST /auth/logout  (JWT)         — clears the cookie
 *  - GET  /auth/me      (JWT)         — returns the current user
 *
 * The cookie is set with HttpOnly + Secure + SameSite=Strict so:
 *  - JS cannot read it (immune to XSS exfiltration)
 *  - Browsers will not send it on cross-site requests (immune to CSRF)
 *  - It will only ride HTTPS in production
 */
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    maxAge: number;
    path: string;
  };

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    const ttlHours =
      parseInt(config.get<string>('JWT_TTL_HOURS') ?? '') || 24;
    this.cookieOptions = {
      httpOnly: true,
      secure: config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: ttlHours * 60 * 60 * 1000,
      path: '/',
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ email: string; role: string }> {
    const user = await this.authService.validateCredentials(dto.email, dto.password);
    const token = this.authService.signToken(user);
    res.cookie(COOKIE_NAME, token, this.cookieOptions);
    return { email: user.email, role: user.role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedPrincipal): {
    email: string;
    role: string;
  } {
    // JwtAuthGuard guarantees kind === 'user'
    if (user.kind !== 'user') {
      // Defensive — should be unreachable.
      throw new Error('JwtAuthGuard yielded a non-user principal');
    }
    return { email: user.email, role: user.role };
  }
}
