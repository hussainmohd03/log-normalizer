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
    if (user.kind !== 'user') {
      throw new Error('JwtAuthGuard yielded a non-user principal');
    }
    return { email: user.email, role: user.role };
  }
}
