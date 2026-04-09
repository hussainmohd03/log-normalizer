import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { Response } from 'express'
import { User, UserRole } from 'generated/prisma/client'
import { AuthController } from 'src/auth/auth.controller'
import { AuthService } from 'src/auth/auth.service'
import { AuthenticatedPrincipal } from 'src/auth/auth.types'

const SAMPLE_USER: User = {
  id: 'user-uuid-1',
  email: 'analyst@example.com',
  passwordHash: 'unused',
  role: UserRole.ANALYST,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
}

function makeRes() {
  const res = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  }
  return res as unknown as Response
}

describe('AuthController', () => {
  let controller: AuthController
  let mockAuth: { validateCredentials: jest.Mock; signToken: jest.Mock }

  beforeEach(async () => {
    mockAuth = {
      validateCredentials: jest.fn(),
      signToken: jest.fn().mockReturnValue('signed.jwt.token'),
    }

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'JWT_TTL_HOURS' ? '1' : undefined) },
        },
      ],
    }).compile()

    controller = module.get(AuthController)
  })

  // ── login ──────────────────────────────────────────────────────────────

  it('login: sets the auth_token cookie with HttpOnly + SameSite=strict', async () => {
    mockAuth.validateCredentials.mockResolvedValueOnce(SAMPLE_USER)
    const res = makeRes()

    const result = await controller.login(
      { email: SAMPLE_USER.email, password: 'pw' },
      res,
    )

    expect(result).toEqual({ email: SAMPLE_USER.email, role: SAMPLE_USER.role })
    expect(res.cookie).toHaveBeenCalledTimes(1)
    const [name, token, options] = (res.cookie as jest.Mock).mock.calls[0]
    expect(name).toBe('auth_token')
    expect(token).toBe('signed.jwt.token')
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('strict')
    // 1h TTL × 60min × 60s × 1000ms
    expect(options.maxAge).toBe(60 * 60 * 1000)
    expect(options.path).toBe('/')
  })

  it('login: secure flag is false outside production', async () => {
    mockAuth.validateCredentials.mockResolvedValueOnce(SAMPLE_USER)
    const res = makeRes()
    await controller.login({ email: SAMPLE_USER.email, password: 'pw' }, res)
    const options = (res.cookie as jest.Mock).mock.calls[0][2]
    expect(options.secure).toBe(false)
  })

  it('login: propagates UnauthorizedException from AuthService', async () => {
    mockAuth.validateCredentials.mockRejectedValueOnce(
      new UnauthorizedException('Invalid credentials'),
    )
    const res = makeRes()

    await expect(
      controller.login({ email: 'x@y.z', password: 'pw' }, res),
    ).rejects.toBeInstanceOf(UnauthorizedException)

    expect(res.cookie).not.toHaveBeenCalled()
  })

  // ── logout ─────────────────────────────────────────────────────────────

  it('logout: clears the auth_token cookie', () => {
    const res = makeRes()
    controller.logout(res)
    expect(res.clearCookie).toHaveBeenCalledWith('auth_token', { path: '/' })
  })

  // ── /me ────────────────────────────────────────────────────────────────

  it('me: returns the email + role of the authenticated user principal', () => {
    const principal: AuthenticatedPrincipal = {
      kind: 'user',
      userId: SAMPLE_USER.id,
      email: SAMPLE_USER.email,
      role: SAMPLE_USER.role,
    }
    expect(controller.me(principal)).toEqual({
      email: SAMPLE_USER.email,
      role: SAMPLE_USER.role,
    })
  })

  it('me: throws if a non-user principal somehow reaches it (defensive)', () => {
    const principal: AuthenticatedPrincipal = { kind: 'apiKey' }
    expect(() => controller.me(principal)).toThrow(/non-user principal/)
  })
})
