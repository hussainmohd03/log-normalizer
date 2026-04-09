import { PrismaService } from "src/database/prisma.service";

export async function cleanDatabase(prisma: PrismaService) {
  // Delete children first (FK to NormalizeJob), then jobs, then metrics.
  // ManualReview FKs into TrainingExport (SetNull) — clear reviews first
  // so deleting TrainingExport doesn't trip the seeded user FK.
  await prisma.manualReview.deleteMany();
  await prisma.trainingExport.deleteMany();
  await prisma.oCSFEvent.deleteMany();
  await prisma.normalizeJob.deleteMany();
  await prisma.processingMetric.deleteMany();
}

