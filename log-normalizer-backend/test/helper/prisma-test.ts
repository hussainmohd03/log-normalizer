import { PrismaService } from "src/database/prisma.service";

export async function cleanDatabase(prisma: PrismaService) {
  // Delete children first (FK to NormalizeJob), then jobs, then metrics.
  await prisma.manualReview.deleteMany();
  await prisma.oCSFEvent.deleteMany();
  await prisma.normalizeJob.deleteMany();
  await prisma.processingMetric.deleteMany();
}

