// Operator view of the latest order: job status, pipeline output, QA verdict.
// Usage: npx tsx scripts/dev/monitor.ts
import { prisma } from '../../src/config/database.js';

async function main() {
  const jobs = await prisma.jobQueue.findMany({ orderBy: { createdAt: 'desc' }, take: 3 });
  console.log('=== JOB TERAKHIR ===');
  for (const j of jobs) {
    const age = Math.round((Date.now() - j.createdAt.getTime()) / 1000);
    console.log(`${j.status.padEnd(11)} attempt ${j.attempts}/${j.maxAttempts}  ${age}s lalu  ${JSON.stringify(j.payload)}`);
    if (j.error) console.log('  ERROR: ' + j.error.split('\n')[0].slice(0, 220));
  }

  const p = await prisma.project.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      payment: true,
      candidates: { select: { name: true, estimatedRent: true, propertySize: true, status: true } },
      reports: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { competitors: true, dataSources: true } },
    },
  });
  if (!p) return console.log('\nbelum ada project');

  console.log('\n=== PROJECT TERBARU ===');
  console.log('nama      :', p.name);
  console.log('tipe      :', p.projectType, '| status:', p.status);
  console.log('pembayaran:', p.payment?.status, p.payment ? `Rp ${p.payment.amount.toLocaleString('id-ID')}` : '');
  console.log('kompetitor:', p._count.competitors, '| provenance:', p._count.dataSources);
  console.log('properti  :', p.candidates.map(c => `${c.name} (${c.status}, sewa ${c.estimatedRent ?? '-'}, ${c.propertySize ?? '-'}m2)`).join(' | ') || '-');

  const r = p.reports[0];
  if (!r) return console.log('\nlaporan   : belum ada');
  console.log('\n=== LAPORAN ===');
  console.log('status    :', r.status, r.status === 'REVIEW' ? '<- tombol Approve MUNCUL' : '<- tombol Approve tidak muncul');
  const qa = r.qaReview as any;
  if (qa) {
    console.log('QA        :', qa.isApproved ? 'LULUS' : 'DITOLAK', `(confidence ${qa.confidenceScore ?? '-'})`);
    for (const i of qa.issues ?? []) console.log('  - ' + String(i).slice(0, 200));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
