import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Prisma, User, UserRole } from 'generated/prisma/client'
import { AuthService } from 'src/auth/auth.service'
import { PrismaService } from 'src/database/prisma.service'
import { UsersService } from 'src/users/users.service'

const ADMIN_ALICE: User = {
  id: 'admin-alice-id',
  email: 'alice@beyon.bh',
  passwordHash: 'unused',
  role: UserRole.ADMIN,
  createdAt: new Date('2026-03-01T00:00:00Z'),
  updatedAt: new Date('2026-03-01T00:00:00Z'),
  lastLoginAt: null,
}

const ANALYST_BOB: User = {
  id: 'analyst-bob-id',
  email: 'bob@beyon.bh',
  passwordHash: 'unused',
  role: UserRole.ANALYST,
  createdAt: new Date('2026-03-05T00:00:00Z'),
  updatedAt: new Date('2026-03-05T00:00:00Z'),
  lastLoginAt: null,
}

function makePrismaMock() {
  return {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
  }
}

describe('UsersService', () => {
  let service: UsersService
  let prisma: ReturnType<typeof makePrismaMock>
  let authService: { createUser: jest.Mock }

  beforeEach(async () => {
    prisma = makePrismaMock()
    authService = { createUser: jest.fn() }

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
      ],
    }).compile()

    service = module.get(UsersService)
  })

  describe('list', () => {
    it('returns users without the passwordHash field', async () => {
      prisma.user.findMany.mockResolvedValueOnce([ADMIN_ALICE, ANALYST_BOB])

      await service.list()

      const arg = prisma.user.findMany.mock.calls[0][0]
      expect(arg.select.passwordHash).toBe(false)
      expect(arg.orderBy).toEqual({ createdAt: 'asc' })
    })
  })

  describe('create', () => {
    it('delegates to AuthService.createUser', async () => {
      authService.createUser.mockResolvedValueOnce(ANALYST_BOB)

      const result = await service.create({
        email: 'bob@beyon.bh',
        password: 'password123',
        role: UserRole.ANALYST,
      })

      expect(authService.createUser).toHaveBeenCalledWith({
        email: 'bob@beyon.bh',
        password: 'password123',
        role: UserRole.ANALYST,
      })
      expect(result).toBe(ANALYST_BOB)
    })

    it('throws ConflictException on P2002 unique violation', async () => {
      authService.createUser.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      )

      await expect(
        service.create({
          email: 'bob@beyon.bh',
          password: 'password123',
          role: UserRole.ANALYST,
        }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('propagates non-P2002 errors as-is', async () => {
      authService.createUser.mockRejectedValueOnce(new Error('db gone'))

      await expect(
        service.create({
          email: 'bob@beyon.bh',
          password: 'password123',
          role: UserRole.ANALYST,
        }),
      ).rejects.toThrow('db gone')
    })
  })

  describe('delete', () => {
    it('happy path: deletes a non-self, non-last-admin user', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(ANALYST_BOB)
      prisma.user.delete.mockResolvedValueOnce(ANALYST_BOB)

      await service.delete(ADMIN_ALICE.id, ANALYST_BOB.id)

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: ANALYST_BOB.id } })
    })

    it('blocks self-delete with BadRequestException', async () => {
      await expect(
        service.delete(ADMIN_ALICE.id, ADMIN_ALICE.id),
      ).rejects.toBeInstanceOf(BadRequestException)

      expect(prisma.user.findUnique).not.toHaveBeenCalled()
      expect(prisma.user.delete).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when target does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await expect(
        service.delete(ADMIN_ALICE.id, 'missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException)

      expect(prisma.user.delete).not.toHaveBeenCalled()
    })

    it('blocks deleting the last remaining admin', async () => {
      const otherAdmin: User = { ...ADMIN_ALICE, id: 'admin-other-id', email: 'other@beyon.bh' }
      prisma.user.findUnique.mockResolvedValueOnce(otherAdmin)
      prisma.user.count.mockResolvedValueOnce(1)

      await expect(
        service.delete(ADMIN_ALICE.id, otherAdmin.id),
      ).rejects.toThrow(/last admin/i)

      expect(prisma.user.delete).not.toHaveBeenCalled()
    })

    it('allows deleting an admin when at least one other admin exists', async () => {
      const otherAdmin: User = { ...ADMIN_ALICE, id: 'admin-other-id', email: 'other@beyon.bh' }
      prisma.user.findUnique.mockResolvedValueOnce(otherAdmin)
      prisma.user.count.mockResolvedValueOnce(2)
      prisma.user.delete.mockResolvedValueOnce(otherAdmin)

      await service.delete(ADMIN_ALICE.id, otherAdmin.id)

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: otherAdmin.id } })
    })

    it('does not consult admin count when target is an analyst', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(ANALYST_BOB)
      prisma.user.delete.mockResolvedValueOnce(ANALYST_BOB)

      await service.delete(ADMIN_ALICE.id, ANALYST_BOB.id)

      expect(prisma.user.count).not.toHaveBeenCalled()
    })
  })
})
