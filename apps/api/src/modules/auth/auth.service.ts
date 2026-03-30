import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';

interface AuthUserResponse {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}

interface AuthResponse {
  data: AuthUserResponse;
  token: string;
  expiresAt: string;
}

interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  surgeThreshold: number;
  settingsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly tokenExpiryHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.get<string>('JWT_SECRET', 'default-dev-secret-change-in-production');
    this.tokenExpiryHours = this.config.get<number>('JWT_EXPIRY_HOURS', 24);
  }

  /**
   * Register a new user.
   * Hashes the password with scrypt and creates a JWT token.
   */
  async signup(dto: SignupDto): Promise<AuthResponse> {
    // Check for existing user
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    const expiresAt = new Date(Date.now() + this.tokenExpiryHours * 60 * 60 * 1000);
    const token = this.generateToken(user.id, expiresAt);

    this.logger.log(`User registered: ${user.email} (id=${user.id})`);

    return {
      data: user,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Authenticate a user with email and password.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    }

    const expiresAt = new Date(Date.now() + this.tokenExpiryHours * 60 * 60 * 1000);
    const token = this.generateToken(user.id, expiresAt);

    this.logger.log(`User logged in: ${user.email} (id=${user.id})`);

    return {
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Get the full profile for an authenticated user.
   */
  async getProfile(userId: number): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        surgeThreshold: true,
        settingsJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user as any;
  }

  // ─── Private Helpers ─────────────────────────────────────────

  /**
   * Hash a password using scrypt with a random salt.
   * Format: salt:hash (both hex-encoded)
   */
  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = await new Promise<string>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      });
    });
    return `${salt}:${hash}`;
  }

  /**
   * Verify a password against a stored salt:hash string.
   */
  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey);
  }

  /**
   * Generate a simple JWT token.
   *
   * NOTE: Uses HMAC-SHA256 for signing. In production, consider using
   * a dedicated JWT library (jsonwebtoken) or Better Auth sessions.
   */
  private generateToken(userId: number, expiresAt: Date): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      userId,
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }
}
