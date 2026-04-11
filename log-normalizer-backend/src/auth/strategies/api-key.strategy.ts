import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { AuthenticatedPrincipal } from '../auth.types';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(HeaderAPIKeyStrategy, 'api-key') {
  private readonly serverKey: string;

  constructor(config: ConfigService) {
    super({ header: 'x-api-key', prefix: '' }, false);
    this.serverKey = config.getOrThrow<string>('API_KEY');
  }

  validate(apiKey: string): AuthenticatedPrincipal {
    if (!apiKey || apiKey !== this.serverKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return { kind: 'apiKey' };
  }
}
