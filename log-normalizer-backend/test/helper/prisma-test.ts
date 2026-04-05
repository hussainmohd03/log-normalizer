import { PrismaService } from 'src/database/prisma.service';

export async function cleanDatabase(prisma: PrismaService) {
  await prisma.manualReview.deleteMany();
  await prisma.oCSFEvent.deleteMany();
  await prisma.processingMetric.deleteMany();
  await prisma.rawLog.deleteMany();
}
