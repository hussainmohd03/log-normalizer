import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedPrincipal } from '../auth.types';

/**
 * Injects the authenticated principal into a controller method:
 *
 *   @UseGuards(JwtAuthGuard)
 *   @Post('correct')
 *   async correct(@CurrentUser() user: AuthenticatedPrincipal) {
 *     // user.kind === 'user' guaranteed when behind JwtAuthGuard
 *   }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal => {
    return ctx.switchToHttp().getRequest().user as AuthenticatedPrincipal;
  },
);
