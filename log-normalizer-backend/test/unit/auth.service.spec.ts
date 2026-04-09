import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { User, UserRole } from 'generated/prisma/client'
import { AuthService } from 'src/auth/auth.service'
import { JwtPayload } from 'src/auth/auth.types'
import { PrismaService } from 'src/database/prisma.service'

const SAMPLE_USER: User = {
  id: 'user-uuid-1',
  email: 'analyst@example.com',
  passwordHash: '__placeholder__', // overwritten in tests that exercise verify
  role: UserRole.ANALYST,
  createdAt: new Date('2026-04-09T08:00:00Z'),
  updatedAt: new Date('2026-04-09T08:00:00Z'),
  lastLoginAt: null,
}

describe('AuthService', () => {
  let service: AuthService
  let mockPrisma: {
    user: {
      findUnique: jest.Mock
      update: jest.Mock
      create: jest.Mock
    }
  }
  let mockJwt: { sign: jest.Mock }

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(SAMPLE_USER),
        create: jest.fn().mockResolvedValue(SAMPLE_USER),
      },
    }
    mockJwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') }

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        {
          provide: ConfigService,
          useValue: { get: () => undefined, getOrThrow: () => 'test-secret' },
        },
      ],
    }).compile()

    service = module.get(AuthService)
  })

  // ── password hashing round-trip ────────────────────────────────────────

  it('hashPassword produces a verifiable argon2id hash', async () => {
    const hash = await service.hashPassword('correct-horse-battery-staple')

    expect(hash).toMatch(/^\$argon2id\$/) // argon2id PHC string format
    expect(await service.verifyPassword(hash, 'correct-horse-battery-staple')).toBe(true)
  })

  it('verifyPassword returns false on wrong password', async () => {
    const hash = await service.hashPassword('correct-horse-battery-staple')
    expect(await service.verifyPassword(hash, 'wrong-password')).toBe(false)
  })

  it('verifyPassword returns false on malformed hash (no throw)', async () => {
    expect(await service.verifyPassword('not-a-real-hash', 'anything')).toBe(false)
  })

  // ── login flow ─────────────────────────────────────────────────────────

  it('validateCredentials throws UnauthorizedException when user is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)

    await expect(
      service.validateCredentials('nobody@example.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('validateCredentials throws UnauthorizedException on wrong password', async () => {
    const hash = await service.hashPassword('the-real-password')
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...SAMPLE_USER, passwordHash: hash })

    await expect(
      service.validateCredentials(SAMPLE_USER.email, 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('validateCredentials returns the user and bumps lastLoginAt on success', async () => {
    const hash = await service.hashPassword('correct-pw')
    const userWithHash = { ...SAMPLE_USER, passwordHash: hash }
    mockPrisma.user.findUnique.mockResolvedValueOnce(userWithHash)

    const result = await service.validateCredentials(SAMPLE_USER.email, 'correct-pw')

    expect(result.id).toBe(SAMPLE_USER.id)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: SAMPLE_USER.id },
      data: { lastLoginAt: expect.any(Date) },
    })
  })

  it('validateCredentials does not distinguish missing-user from wrong-password (no enumeration)', async () => {
    // Both error paths should produce the same exception type and message
    // so a caller cannot tell whether the email exists.
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    const missingErr = await service
      .validateCredentials('missing@example.com', 'pw')
      .catch((e) => e)

    const hash = await service.hashPassword('the-real-password')
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...SAMPLE_USER, passwordHash: hash })
    const wrongPwErr = await service
      .validateCredentials(SAMPLE_USER.email, 'wrong-password')
      .catch((e) => e)

    expect(missingErr).toBeInstanceOf(UnauthorizedException)
    expect(wrongPwErr).toBeInstanceOf(UnauthorizedException)
    expect((missingErr as Error).message).toBe((wrongPwErr as Error).message)
  })

  // ── token issue / verify ───────────────────────────────────────────────

  it('signToken delegates to JwtService with the right payload', () => {
    const token = service.signToken(SAMPLE_USER)
    expect(token).toBe('signed.jwt.token')
    expect(mockJwt.sign).toHaveBeenCalledWith({
      sub: SAMPLE_USER.id,
      email: SAMPLE_USER.email,
      role: SAMPLE_USER.role,
    })
  })

  it('resolvePrincipalFromJwt re-reads the user from DB and returns null when missing', async () => {
    const payload: JwtPayload = {
      sub: 'gone-user',
      email: 'gone@example.com',
      role: UserRole.ANALYST,
    }
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)

    const result = await service.resolvePrincipalFromJwt(payload)
    expect(result).toBeNull()
  })

  it('resolvePrincipalFromJwt returns the live row when present', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(SAMPLE_USER)

    const result = await service.resolvePrincipalFromJwt({
      sub: SAMPLE_USER.id,
      email: SAMPLE_USER.email,
      role: SAMPLE_USER.role,
    })
    expect(result).toEqual(SAMPLE_USER)
  })

  // ── createUser helper ──────────────────────────────────────────────────

  it('createUser hashes the password before insert', async () => {
    await service.createUser({
      email: 'new@example.com',
      password: 'fresh-password-1',
      role: UserRole.ANALYST,
    })

    const arg = mockPrisma.user.create.mock.calls[0][0]
    expect(arg.data.email).toBe('new@example.com')
    expect(arg.data.role).toBe(UserRole.ANALYST)
    expect(arg.data.passwordHash).toMatch(/^\$argon2id\$/)
    // Critically: the plain password is NOT in the insert
    expect(arg.data.passwordHash).not.toBe('fresh-password-1')
  })
})
