import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { SignupDtoSchema, type SignupDto } from './dto/signup.dto';
import { LoginDtoSchema, type LoginDto } from './dto/login.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * AuthController — Authentication endpoints.
 *
 * POST /api/auth/signup  — Create account
 * POST /api/auth/login   — Authenticate
 * POST /api/auth/logout  — Invalidate session
 * GET  /api/auth/me      — Get profile
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(SignupDtoSchema))
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginDtoSchema))
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  logout() {
    // In a stateless JWT setup, logout is handled client-side by discarding the token.
    // For a production deployment with token blacklisting, add Redis-based invalidation here.
    return { message: 'Logged out successfully.' };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.authService.getProfile(user.id);
    return { data: profile };
  }
}
