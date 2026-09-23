import { prisma } from '../../src/config/database.js';

const job = await prisma.jobQueue.findFirst({ where: { status: 'PROCESSING' }, orderBy: { createdAt: 'desc' } });
if (!job) { console.log('Tidak ada pekerjaan yang sedang berjalan.'); process.exit(0); }

const { projectId } = job.payload as { projectId: string };
const p = await prisma.project.findUnique({ where: { id: projectId } });
const age = Math.round((Date.now() - job.createdAt.getTime()) / 1000);

console.log(`Pesanan : ${p?.name.slice(0, 55)}`);
console.log(`Status  : ${p?.status}   |   berjalan ${age} detik\n`);

const stages: Array<[string, unknown]> = [
  ['1. Rencana riset', p?.researchPlan],
  ['2. Analisis pesaing', p?.competitionAnalysis],
  ['3. Analisis permintaan', p?.demandAnalysis],
  ['4. Celah pasar', p?.marketGapAnalysis],
  ['5. Aksesibilitas', p?.accessibilityAnalysis],
  ['6. Finansial', p?.financialAnalysis],
  ['7. Skor', p?.scoringAnalysis],
];
for (const [label, value] of stages) console.log(`  ${value ? 'SELESAI ' : 'belum   '} ${label}`);

const [competitors, sources, reports] = await Promise.all([
  prisma.competitor.count({ where: { projectId } }),
  prisma.dataSource.count({ where: { projectId } }),
  prisma.report.count({ where: { projectId } }),
]);
console.log(`\n  pesaing tercatat : ${competitors}`);
console.log(`  panggilan sumber : ${sources}`);
console.log(`  laporan dibuat   : ${reports}`);

const last = await prisma.dataSource.findFirst({ where: { projectId }, orderBy: { retrievedAt: 'desc' } });
if (last) {
  const secs = Math.round((Date.now() - last.retrievedAt.getTime()) / 1000);
  console.log(`  aktivitas terakhir: ${last.dataType} (${secs} detik lalu)`);
}
process.exit(0);
