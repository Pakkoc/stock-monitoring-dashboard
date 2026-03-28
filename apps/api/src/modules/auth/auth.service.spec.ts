/**
 * Unit tests for AuthService.
 *
 * Tests:
 * - signup() — successful registration, duplicate email conflict
 * - login() — successful authentication, invalid credentials
 * - getProfile() — profile retrieval, user not found
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  createMockPrismaService,
  createMockConfigService,
} from '../../../test/setup';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    config = createMockConfigService();

    service = new AuthService(prisma as any, config as any);
  });

  // ─── signup ─────────────────────────────────────────────────────

  describe('signup', () => {
    it('should create a new user and return token', async () => {
      const now = new Date();

      prisma.user.findUnique.mockResolvedValue(null); // No existing user
      prisma.user.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        createdAt: now,
      });

      const result = await service.signup({
        email: 'test@example.com',
        password: 'StrongP@ss1',
        name: 'Test User',
      });

      expect(result.data.email).toBe('test@example.com');
      expect(result.data.name).toBe('Test User');
      expect(result.token).toBeDefined();
      expect(result.token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
      expect(result.expiresAt).toBeDefined();
    });

    it('should throw ConflictException when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'existing@example.com',
      });

      await expect(
        service.signup({
          email: 'existing@example.com',
          password: 'StrongP@ss1',
          name: 'Duplicate User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should hash the password before storing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        createdAt: new Date(),
      });

      await service.signup({
        email: 'test@example.com',
        password: 'MyPassword123',
        name: 'Test User',
      });

      // Verify create was called with a hashed password (salt:hash format)
      const createCall = prisma.user.create.mock.calls[0][0];
      const storedHash = createCall.data.passwordHash;
      expect(storedHash).toContain(':'); // salt:hash format
      expect(storedHash).not.toBe('MyPassword123'); // Must not be plain text
      expect(storedHash.split(':')[0]).toHaveLength(64); // 32 bytes hex = 64 chars
    });
  });

  // ─── login ──────────────────────────────────────────────────────

  describe('login', () => {
    it('should authenticate valid credentials and return token', async () => {
      // First, create a user with signup to get a valid hash
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async (args: any) => ({
        id: 1,
        email: args.data.email,
        name: args.data.name,
        role: 'USER',
        passwordHash: args.data.passwordHash,
        createdAt: new Date(),
      }));

      const signupResult = await service.signup({
        email: 'test@example.com',
        password: 'ValidP@ss1',
        name: 'Test User',
      });

      // Get the stored password hash from the create call
      const storedHash = prisma.user.create.mock.calls[0][0].data.passwordHash;

      // Now mock login: findUnique returns user with the real hash
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        passwordHash: storedHash,
        createdAt: new Date(),
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'ValidP@ss1',
      });

      expect(result.data.email).toBe('test@example.com');
      expect(result.token).toBeDefined();
      expect(result.token.split('.')).toHaveLength(3);
    });

    it('should throw UnauthorizedException for non-existent email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'SomeP@ss1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        passwordHash: 'invalidsalt:invalidhash',
        createdAt: new Date(),
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── getProfile ────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return user profile for valid userId', async () => {
      const mockProfile = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        surgeThreshold: 5.0,
        settingsJson: { theme: 'dark' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockProfile);

      const result = await service.getProfile(1);

      expect(result.id).toBe(1);
      expect(result.email).toBe('test@example.com');
      expect(result.surgeThreshold).toBe(5.0);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(999)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
