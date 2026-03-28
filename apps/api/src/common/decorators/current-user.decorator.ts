import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extract the authenticated user from the request.
 *
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: AuthenticatedUser) { ... }
 */

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): AuthenticatedUser | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
