import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function run() {
  try {
    const report = await prisma.report.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (!report) {
      console.log('No report found in DB.');
      return;
    }

    const output = JSON.stringify(report.contentJson, null, 2);
    fs.writeFileSync('C:\\Users\\hakim\\.gemini\\antigravity-ide\\brain\\f4f6d1c2-3577-4673-8320-e957d51473ba\\scratch\\latest-report.json', output);
    console.log('Report saved to scratch/latest-report.json');
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
