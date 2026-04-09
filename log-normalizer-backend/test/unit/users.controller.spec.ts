import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { User, UserRole } from 'generated/prisma/client'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { RolesGuard } from 'src/auth/guards/roles.guard'
import { UsersController } from 'src/users/users.controller'
import { UsersService } from 'src/users/users.service'

const ALICE: User = {
  id: 'admin-alice-id',
  email: 'alice@beyon.bh',
  passwordHash: 'unused',
  role: UserRole.ADMIN,
  createdAt: new Date('2026-03-01T00:00:00Z'),
  updatedAt: new Date('2026-03-01T00:00:00Z'),
  lastLoginAt: new Date('2026-04-09T08:00:00Z'),
}

const BOB: User = {
  id: 'analyst-bob-id',
  email: 'bob@beyon.bh',
  passwordHash: 'unused',
  role: UserRole.ANALYST,
  createdAt: new Date('2026-03-05T00:00:00Z'),
  updatedAt: new Date('2026-03-05T00:00:00Z'),
  lastLoginAt: null,
}

describe('UsersController', () => {
  let controller: UsersController
  let mockService: {
    list: jest.Mock
    create: jest.Mock
    delete: jest.Mock
  }

  beforeEach(async () => {
    mockService = {
      list: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    }

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get(UsersController)
  })

  describe('GET /', () => {
    it('returns mapped UserResponse[] with ISO date strings and no passwordHash', async () => {
      mockService.list.mockResolvedValueOnce([ALICE, BOB])

      const result = await controller.list()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: ALICE.id,
        email: ALICE.email,
        role: ALICE.role,
        createdAt: ALICE.createdAt.toISOString(),
        lastLoginAt: ALICE.lastLoginAt!.toISOString(),
      })
      expect(result[1].lastLoginAt).toBeNull()
      expect((result[0] as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
    })
  })

  describe('POST /', () => {
    it('forwards the DTO to UsersService.create and returns the mapped envelope', async () => {
      mockService.create.mockResolvedValueOnce(BOB)

      const result = await controller.create({
        email: 'bob@beyon.bh',
        password: 'password123',
        role: UserRole.ANALYST,
      })

      expect(mockService.create).toHaveBeenCalledWith({
        email: 'bob@beyon.bh',
        password: 'password123',
        role: UserRole.ANALYST,
      })
      expect(result.email).toBe(BOB.email)
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
    })
  })

  describe('DELETE /:id', () => {
    it('passes actor.userId and target id to the service', async () => {
      mockService.delete.mockResolvedValueOnce(undefined)

      await controller.delete(BOB.id, {
        kind: 'user',
        userId: ALICE.id,
        email: ALICE.email,
        role: ALICE.role,
      })

      expect(mockService.delete).toHaveBeenCalledWith(ALICE.id, BOB.id)
    })

    it('throws ForbiddenException when called with an apiKey principal', async () => {
      await expect(
        controller.delete(BOB.id, { kind: 'apiKey' }),
      ).rejects.toBeInstanceOf(ForbiddenException)

      expect(mockService.delete).not.toHaveBeenCalled()
    })
  })
})
