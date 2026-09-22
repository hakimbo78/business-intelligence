import { prisma } from '../../src/config/database.js';

async function main() {
  const job = await prisma.jobQueue.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(job, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
