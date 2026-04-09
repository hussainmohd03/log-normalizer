import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserRole } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { TrainingDataService } from 'src/training-data/training-data.service';
import { NoCorrectionsToExportError } from 'src/training-data/training-data.types';
import { SLM_TRAINING_SYSTEM_PROMPT } from 'src/training-data/training-prompt.constant';
import { cleanDatabase } from 'test/helper/prisma-test';

describe('TrainingDataService', () => {
  let service: TrainingDataService;
  let prisma: PrismaService;
  let adminId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [TrainingDataService, PrismaService],
    }).compile();

    service = module.get(TrainingDataService);
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    // Each test re-uses a single admin row. Re-create from scratch so a
    // failed earlier test that left the row behind doesn't bleed in.
    await prisma.user.deleteMany({ where: { email: 'export-admin@test' } });
    const admin = await prisma.user.create({
      data: {
        email: 'export-admin@test',
        passwordHash: 'unused',
        role: UserRole.ADMIN,
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.user.deleteMany({ where: { email: 'export-admin@test' } });
    await prisma.$disconnect();
  });

  // ── helpers ───────────────────────────────────────────────────────────

  const seedReview = async (opts: {
    corrected: boolean;
    rawLog?: Record<string, unknown>;
    correctedOcsf?: Record<string, unknown>;
    source?: string;
  }) => {
    const job = await prisma.normalizeJob.create({
      data: {
        rawLog: opts.rawLog ?? { alert_id: 'a', severity: 'high' },
        source: opts.source ?? 'crowdstrike',
        format: 'json',
      },
    });
    return prisma.manualReview.create({
      data: {
        normalizeJobId: job.id,
        source: job.source,
        slmOcsfOutput: { class_uid: 2004 },
        confidence: 0.5,
        priority: 'NORMAL',
        correctedOCSF: opts.corrected
          ? (opts.correctedOcsf ?? { class_uid: 2004, type_uid: 200401 })
          : undefined,
      },
    });
  };

  // ── getStats ──────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zeros and an empty history on a clean DB', async () => {
      const stats = await service.getStats();
      expect(stats.totalCorrections).toBe(0);
      expect(stats.pendingExport).toBe(0);
      expect(stats.alreadyExported).toBe(0);
      expect(stats.lastExportAt).toBeNull();
      expect(stats.exportHistory).toEqual([]);
    });

    it('counts corrected vs uncorrected reviews correctly', async () => {
      await seedReview({ corrected: false });
      await seedReview({ corrected: true });
      await seedReview({ corrected: true });

      const stats = await service.getStats();
      expect(stats.totalCorrections).toBe(2);
      expect(stats.pendingExport).toBe(2);
      expect(stats.alreadyExported).toBe(0);
    });

    it('moves rows from pending to alreadyExported after exportPending', async () => {
      await seedReview({ corrected: true });
      await seedReview({ corrected: true });
      await service.exportPending(adminId);

      const stats = await service.getStats();
      expect(stats.pendingExport).toBe(0);
      expect(stats.alreadyExported).toBe(2);
      expect(stats.lastExportAt).not.toBeNull();
      expect(stats.exportHistory).toHaveLength(1);
      expect(stats.exportHistory[0].recordCount).toBe(2);
      expect(stats.exportHistory[0].exportedByEmail).toBe('export-admin@test');
    });

    it('returns the last 20 exports ordered desc by exportedAt', async () => {
      // Create 22 export rows directly (no reviews needed for this assertion)
      for (let i = 0; i < 22; i++) {
        await prisma.trainingExport.create({
          data: { exportedById: adminId, recordCount: i },
        });
      }
      const stats = await service.getStats();
      expect(stats.exportHistory).toHaveLength(20);
      // Newest first → highest recordCount first (since we created in order)
      expect(stats.exportHistory[0].recordCount).toBe(21);
      expect(stats.exportHistory[19].recordCount).toBe(2);
    });
  });

  // ── exportPending ─────────────────────────────────────────────────────

  describe('exportPending', () => {
    it('throws NoCorrectionsToExportError when nothing is pending', async () => {
      await expect(service.exportPending(adminId)).rejects.toBeInstanceOf(
        NoCorrectionsToExportError,
      );
    });

    it('uncorrected reviews are not picked up', async () => {
      await seedReview({ corrected: false });
      await expect(service.exportPending(adminId)).rejects.toBeInstanceOf(
        NoCorrectionsToExportError,
      );
    });

    it('exports 3 pending rows: creates 1 TrainingExport, marks all 3, returns 3-line jsonl', async () => {
      await seedReview({ corrected: true });
      await seedReview({ corrected: true });
      await seedReview({ corrected: true });

      const result = await service.exportPending(adminId);

      expect(result.recordCount).toBe(3);
      expect(result.jsonl.split('\n')).toHaveLength(3);

      const exports = await prisma.trainingExport.findMany();
      expect(exports).toHaveLength(1);
      expect(exports[0].id).toBe(result.exportId);
      expect(exports[0].recordCount).toBe(3);
      expect(exports[0].exportedById).toBe(adminId);

      const reviews = await prisma.manualReview.findMany();
      for (const r of reviews) {
        expect(r.trainingExportId).toBe(result.exportId);
      }
    });

    it('each JSONL line is valid chat-format JSON with the SLM system prompt verbatim', async () => {
      await seedReview({
        corrected: true,
        rawLog: { alert_id: 'evt-7', severity: 'high' },
        correctedOcsf: { class_uid: 2004, type_uid: 200401, severity_id: 4 },
        source: 'splunk',
      });

      const result = await service.exportPending(adminId);
      const line = JSON.parse(result.jsonl);

      expect(line.messages).toHaveLength(3);
      expect(line.messages[0].role).toBe('system');
      expect(line.messages[0].content).toBe(SLM_TRAINING_SYSTEM_PROMPT);

      expect(line.messages[1].role).toBe('user');
      expect(line.messages[1].content).toContain(
        'Normalize this splunk security alert to OCSF Detection Finding format.',
      );
      expect(line.messages[1].content).toContain('"alert_id":"evt-7"');

      expect(line.messages[2].role).toBe('assistant');
      const assistantParsed = JSON.parse(line.messages[2].content);
      expect(assistantParsed.class_uid).toBe(2004);
      expect(assistantParsed.type_uid).toBe(200401);
    });

    it('a second exportPending immediately after the first throws (rows are no longer pending)', async () => {
      await seedReview({ corrected: true });
      await seedReview({ corrected: true });

      await service.exportPending(adminId);
      await expect(service.exportPending(adminId)).rejects.toBeInstanceOf(
        NoCorrectionsToExportError,
      );
    });

    it('two concurrent exportPending calls never double-mark a row', async () => {
      // Seed 5 corrected reviews
      for (let i = 0; i < 5; i++) await seedReview({ corrected: true });

      const settled = await Promise.allSettled([
        service.exportPending(adminId),
        service.exportPending(adminId),
      ]);

      // Exactly one should win (or both could partition the rows — but the
      // FOR UPDATE lock blocks the second SELECT until the first commits,
      // by which time the rows are claimed and the second sees zero).
      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');

      // Either: one wins all, the other rejects with NoCorrections
      // Or:     they split (would only happen without FOR UPDATE)
      // Either way, the invariant we care about is: every row is marked
      // by exactly one TrainingExport, and the totals add up to 5.
      const reviews = await prisma.manualReview.findMany();
      const exports = await prisma.trainingExport.findMany();
      const totalAcrossExports = exports.reduce(
        (acc, e) => acc + e.recordCount,
        0,
      );

      expect(reviews.every((r) => r.trainingExportId !== null)).toBe(true);
      expect(totalAcrossExports).toBe(5);
      expect(fulfilled.length + rejected.length).toBe(2);

      // Sanity: no review is marked with an exportId that doesn't exist
      const exportIds = new Set(exports.map((e) => e.id));
      for (const r of reviews) {
        expect(exportIds.has(r.trainingExportId!)).toBe(true);
      }
    });
  });
});
