import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * AdminGuard — Role-based access guard that restricts to ADMIN users only.
 *
 * Must be used AFTER AuthGuard to ensure request.user is populated.
 *
 * Usage:
 *   @UseGuards(AuthGuard, AdminGuard)
 *   @Get('admin/settings')
 *   getSettings() { ... }
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Authentication required.',
      });
    }

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Admin access required.',
      });
    }

    return true;
  }
}
