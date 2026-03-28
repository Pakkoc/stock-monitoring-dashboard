import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../shared/database/prisma.service';

/**
 * JWT-based authentication guard.
 *
 * Validates the Bearer token from the Authorization header.
 * In a production deployment this would use proper JWT verification (e.g., via
 * `jsonwebtoken` or Better Auth's session validation). For this implementation
 * we decode a simple HMAC-signed JWT and attach the user to the request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const payload = this.decodeToken(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, name: true, role: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Attach user to request for use by @CurrentUser() decorator
      (request as Request & { user: typeof user }).user = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }

  /**
   * Decode a simple base64-encoded JWT payload.
   *
   * NOTE: In production, this MUST be replaced with proper JWT signature
   * verification using the JWT_SECRET. This simplified version is for
   * the initial implementation scaffold.
   */
  private decodeToken(token: string): { userId: number; exp: number } {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf-8'),
      ) as { userId?: number; sub?: number; exp?: number };

      const userId = payload.userId ?? payload.sub;
      if (typeof userId !== 'number') {
        throw new Error('Token missing userId');
      }

      // Check expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        throw new Error('Token expired');
      }

      return { userId, exp: payload.exp ?? 0 };
    } catch {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}
