import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import {
  NoCorrectionsToExportError,
  TrainingDataStats,
  TrainingExportResult,
} from './training-data.types';
import { SLM_TRAINING_SYSTEM_PROMPT } from './training-prompt.constant';

@Injectable()
export class TrainingDataService {
  private readonly logger = new Logger(TrainingDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<TrainingDataStats> {
    const [totalCorrections, pendingExport, alreadyExported, lastExport, history] =
      await Promise.all([
        this.prisma.manualReview.count({ where: { correctedOCSF: { not: Prisma.JsonNull } } }),
        this.prisma.manualReview.count({
          where: { correctedOCSF: { not: Prisma.JsonNull }, trainingExportId: null },
        }),
        this.prisma.manualReview.count({ where: { trainingExportId: { not: null } } }),
        this.prisma.trainingExport.findFirst({ orderBy: { exportedAt: 'desc' } }),
        this.prisma.trainingExport.findMany({
          orderBy: { exportedAt: 'desc' },
          take: 20,
          include: { exportedBy: { select: { email: true } } },
        }),
      ]);

    return {
      totalCorrections,
      pendingExport,
      alreadyExported,
      lastExportAt: lastExport ? lastExport.exportedAt : null,
      exportHistory: history.map((h) => ({
        id: h.id,
        exportedAt: h.exportedAt,
        exportedByEmail: h.exportedBy.email,
        recordCount: h.recordCount,
      })),
    };
  }

  async exportPending(adminUserId: string): Promise<TrainingExportResult> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the candidate rows so a concurrent export cannot grab them.
      // FOR UPDATE on the SELECT means the second transaction blocks here
      // until the first commits, then re-evaluates the WHERE and finds zero
      // rows. No row is ever marked by two exports.
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          correctedOCSF: unknown;
          rawLog: unknown;
          source: string;
        }>
      >`
        SELECT mr.id, mr."correctedOCSF", nj."rawLog", nj.source
        FROM "ManualReview" mr
        JOIN "NormalizeJob" nj ON nj.id = mr."normalizeJobId"
        WHERE mr."correctedOCSF" IS NOT NULL
          AND mr."trainingExportId" IS NULL
        ORDER BY mr."queuedAt"
        FOR UPDATE OF mr
      `;

      if (rows.length === 0) {
        throw new NoCorrectionsToExportError();
      }

      const exportRow = await tx.trainingExport.create({
        data: {
          exportedById: adminUserId,
          recordCount: rows.length,
        },
      });

      await tx.manualReview.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { trainingExportId: exportRow.id },
      });

      const jsonl = rows
        .map((r) =>
          JSON.stringify({
            messages: [
              { role: 'system', content: SLM_TRAINING_SYSTEM_PROMPT },
              {
                role: 'user',
                content:
                  `Normalize this ${r.source} security alert to OCSF Detection Finding format.\n\n` +
                  JSON.stringify(r.rawLog),
              },
              { role: 'assistant', content: JSON.stringify(r.correctedOCSF) },
            ],
          }),
        )
        .join('\n');

      this.logger.log(
        { exportId: exportRow.id, adminUserId, recordCount: rows.length },
        'training-data.exported',
      );

      return {
        jsonl,
        recordCount: rows.length,
        exportId: exportRow.id,
      };
    });
  }
}
