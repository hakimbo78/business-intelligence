/** Print the headline figures of a project's latest report. */
import { prisma } from '../../src/config/database.js';

const projectId = process.env.INSPECT_PROJECT_ID!;

const row = await prisma.report.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' } });
const c = row!.contentJson as any;

console.log('PROFIL   :', c.tradeProfile?.label, '| radius', c.tradeProfile?.catchmentRadiusMeters, 'm');
console.log('PENDUDUK :', JSON.stringify(c.population?.rings), '| catchment:', c.population?.catchmentPopulation);
console.log('JALAN OSM:', c.osmRoad?.name, '|', c.osmRoad?.roadClass, '| mobil:', c.osmRoad?.carAccessible, '| satu arah:', c.osmRoad?.oneWay);
console.log('OKUPANSI :', c.occupancy?.verdict);
console.log('   ', c.occupancy?.message);

const s = c.marketShare;
console.log('\nPANGSA PASAR:');
console.log('  pasar         :', s?.potentialTransactionsPerMonth, 'transaksi/bulan');
console.log('  dibutuhkan    :', s?.requiredTransactionsPerMonth, 'transaksi/bulan');
console.log('  pesaing       :', s?.competitorCount, '| minimum?', s?.competitorCountIsMinimum);
console.log('  harus rebut   :', s?.requiredSharePercent + '%');
console.log('  pangsa rata2  :', s?.averageSharePercent + '%');
console.log('  = berapa kali :', s?.timesAverageShare + 'x');

console.log('\nKOMPETISI:', c.analysis?.competition?.countExplanation);
console.log('SKOR     :', c.analysis?.scoring?.overallScore);
console.log('SUMBER   :', JSON.stringify(c.attributions));
process.exit(0);
