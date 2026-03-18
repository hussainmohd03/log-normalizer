import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ApiGuard implements CanActivate{
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    
    const requestKey = request.headers['x-api-key']
    const serverKey = this.config.get('API_KEY')
    
     if (!serverKey) {
      throw new UnauthorizedException('API_KEY not configured on server');
    }

    if (!requestKey || requestKey !== serverKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true 
  }
}