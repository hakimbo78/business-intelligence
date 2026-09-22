import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.jobQueue.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  for (const job of jobs) {
    console.log(`Job [${job.type}] - Status: ${job.status}`);
    if (job.error) {
      console.log(`  Error: ${job.error}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
