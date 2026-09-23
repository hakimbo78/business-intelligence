/** Print API spend: this month overall, and for one project. */
import { costGuardService } from '../../src/services/cost-guard.service.js';
import { formatCost } from '../../src/lib/api-cost.js';
import { env } from '../../src/config/environment.js';

const month = await costGuardService.monthlyUsage();
const spend = await costGuardService.currentSpend();

console.log('=== BULAN INI ===');
for (const s of month.perSku) {
  const free = Number.isFinite(s.freeRemaining) ? `sisa gratis ${s.freeRemaining}` : 'gratis';
  console.log(`  ${s.label.padEnd(30)} ${String(s.calls).padStart(5)} panggilan  ${formatCost(s.estimatedCostUsd, env.USD_TO_IDR).padEnd(28)} ${free}`);
}
console.log(`  TOTAL: ${month.totalCalls} panggilan, ${formatCost(month.totalCostUsd, env.USD_TO_IDR)}`);
console.log(`  Yang benar-benar ditagih setelah jatah gratis: ${formatCost(month.billableCostUsd, env.USD_TO_IDR)}`);

console.log('\n=== BATAS ===');
console.log(`  hari ini : ${formatCost(spend.dayUsd, env.USD_TO_IDR)} dari batas US$ ${spend.limits.dayUsd}`);
console.log(`  bulan ini: ${formatCost(spend.monthUsd, env.USD_TO_IDR)} dari batas US$ ${spend.limits.monthUsd} (${Math.round((spend.monthUsd / spend.limits.monthUsd) * 100)}%)`);

const projectId = process.env.COST_PROJECT_ID;
if (projectId) {
  const p = await costGuardService.projectCost(projectId);
  console.log(`\n=== SATU LAPORAN (${projectId.slice(0, 8)}) ===`);
  for (const s of p.perSku) {
    console.log(`  ${s.label.padEnd(30)} ${String(s.calls).padStart(5)} panggilan  ${formatCost(s.estimatedCostUsd, env.USD_TO_IDR)}`);
  }
  console.log(`  TOTAL SATU LAPORAN: ${formatCost(p.totalCostUsd, env.USD_TO_IDR)}`);
}
process.exit(0);
