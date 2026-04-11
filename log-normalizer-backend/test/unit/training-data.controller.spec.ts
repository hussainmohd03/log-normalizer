import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { UserRole } from 'generated/prisma/client';
import { AuthenticatedPrincipal } from 'src/auth/auth.types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TrainingDataController } from 'src/training-data/training-data.controller';
import { TrainingDataService } from 'src/training-data/training-data.service';
import { NoCorrectionsToExportError } from 'src/training-data/training-data.types';

const ADMIN: AuthenticatedPrincipal = {
  kind: 'user',
  userId: 'admin-uuid',
  email: 'a@x',
  role: UserRole.ADMIN,
};

describe('TrainingDataController', () => {
  let controller: TrainingDataController;
  let mockService: { getStats: jest.Mock; exportPending: jest.Mock };

  beforeEach(async () => {
    mockService = { getStats: jest.fn(), exportPending: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [TrainingDataController],
      providers: [{ provide: TrainingDataService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TrainingDataController);
  });

  // -- stats --------------------------------------------------------------

  describe('GET stats', () => {
    it('returns the service stats verbatim', async () => {
      const stats = {
        totalCorrections: 7,
        pendingExport: 4,
        alreadyExported: 3,
        lastExportAt: new Date('2026-04-09T00:00:00Z'),
        exportHistory: [
          {
            id: 'e1',
            exportedAt: new Date('2026-04-09T00:00:00Z'),
            exportedByEmail: 'a@x',
            recordCount: 3,
          },
        ],
      };
      mockService.getStats.mockResolvedValueOnce(stats);

      const result = await controller.stats();
      expect(result).toBe(stats);
      expect(mockService.getStats).toHaveBeenCalledTimes(1);
    });

    it('propagates service errors', async () => {
      mockService.getStats.mockRejectedValueOnce(new Error('db down'));
      await expect(controller.stats()).rejects.toThrow('db down');
    });
  });

  // -- export -------------------------------------------------------------

  describe('POST export', () => {
    const buildRes = () => {
      const headers: Record<string, string> = {};
      return {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        _headers: headers,
      } as unknown as Response & { _headers: Record<string, string> };
    };

    it('returns the JSONL body and sets Content-Disposition + X-Record-Count + X-Export-Id', async () => {
      mockService.exportPending.mockResolvedValueOnce({
        jsonl: '{"messages":[]}',
        recordCount: 1,
        exportId: 'exp-1',
      });

      const res = buildRes();
      const body = await controller.export(ADMIN, res);

      expect(body).toBe('{"messages":[]}');
      expect(mockService.exportPending).toHaveBeenCalledWith('admin-uuid');
      const headers = (res as unknown as { _headers: Record<string, string> })._headers;
      expect(headers['Content-Disposition']).toMatch(/^attachment; filename="training-export-.*\.jsonl"$/);
      expect(headers['X-Record-Count']).toBe('1');
      expect(headers['X-Export-Id']).toBe('exp-1');
    });

    it('maps NoCorrectionsToExportError to 404', async () => {
      mockService.exportPending.mockRejectedValueOnce(new NoCorrectionsToExportError());
      await expect(controller.export(ADMIN, buildRes())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an apiKey principal with ForbiddenException', async () => {
      await expect(
        controller.export({ kind: 'apiKey' }, buildRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockService.exportPending).not.toHaveBeenCalled();
    });

    it('propagates unexpected service errors', async () => {
      mockService.exportPending.mockRejectedValueOnce(new Error('boom'));
      await expect(controller.export(ADMIN, buildRes())).rejects.toThrow('boom');
    });
  });
});
