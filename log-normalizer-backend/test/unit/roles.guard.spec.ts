import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from 'generated/prisma/client'
import { AuthenticatedPrincipal } from 'src/auth/auth.types'
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator'
import { RolesGuard } from 'src/auth/guards/roles.guard'

function makeContext(user: AuthenticatedPrincipal | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext
}

function makeReflector(roles: UserRole[] | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector
}

describe('RolesGuard', () => {
  it('passes any authenticated principal when no @Roles is set', () => {
    const guard = new RolesGuard(makeReflector(undefined))
    const ctx = makeContext({
      kind: 'user',
      userId: 'u1',
      email: 'a@b.c',
      role: UserRole.ANALYST,
    })
    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('passes when the principal role matches one of the required roles', () => {
    const guard = new RolesGuard(makeReflector([UserRole.ADMIN, UserRole.ANALYST]))
    const ctx = makeContext({
      kind: 'user',
      userId: 'u1',
      email: 'a@b.c',
      role: UserRole.ANALYST,
    })
    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('rejects with 403 when the role does not match', () => {
    const guard = new RolesGuard(makeReflector([UserRole.ADMIN]))
    const ctx = makeContext({
      kind: 'user',
      userId: 'u1',
      email: 'a@b.c',
      role: UserRole.ANALYST,
    })
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException)
    expect(() => guard.canActivate(ctx)).toThrow(/role/i)
  })

  it('rejects API-key principals from any role-gated route', () => {
    const guard = new RolesGuard(makeReflector([UserRole.ANALYST]))
    const ctx = makeContext({ kind: 'apiKey' })
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException)
    expect(() => guard.canActivate(ctx)).toThrow(/user account/i)
  })

  it('rejects an unauthenticated request from a role-gated route', () => {
    const guard = new RolesGuard(makeReflector([UserRole.ANALYST]))
    const ctx = makeContext(undefined)
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException)
  })

  it('uses the ROLES_KEY metadata symbol for lookups', () => {
    const reflector = makeReflector([UserRole.ADMIN])
    const guard = new RolesGuard(reflector)
    const ctx = makeContext({
      kind: 'user',
      userId: 'u1',
      email: 'a@b.c',
      role: UserRole.ADMIN,
    })
    guard.canActivate(ctx)
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array))
  })
})
