import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

/**
 * AuthModule — Authentication and authorization.
 *
 * Responsibilities:
 * - User registration and login (email/password)
 * - JWT token generation and verification
 * - Role-based access control (AuthGuard)
 * - User profile management
 *
 * Exports: AuthGuard, AuthService for cross-module consumption.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
