import { prisma } from '../../src/config/database.js';

const jobs = await prisma.jobQueue.findMany({ orderBy: { createdAt: 'desc' }, take: 8 });
console.log('=== ANTREAN PEKERJAAN (8 terbaru) ===');
for (const j of jobs) {
  const age = Math.round((Date.now() - j.createdAt.getTime()) / 1000);
  console.log(
    `  ${j.status.padEnd(10)} ${j.type.padEnd(22)} percobaan ${j.attempts}/${j.maxAttempts}  umur ${age}s`
  );
  if (j.error) console.log(`      error: ${String(j.error).replace(/\s+/g, ' ').slice(0, 160)}`);
}

const projects = await prisma.project.findMany({ orderBy: { updatedAt: 'desc' }, take: 6 });
console.log('\n=== PROYEK TERBARU ===');
for (const p of projects) {
  const age = Math.round((Date.now() - p.updatedAt.getTime()) / 60000);
  console.log(`  ${p.status.padEnd(18)} ${p.name.slice(0, 48).padEnd(50)} diperbarui ${age} menit lalu`);
}
process.exit(0);
