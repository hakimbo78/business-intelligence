import { researchPlannerAgent } from '../../src/agents/research-planner.agent.js';
import { prisma } from '../../src/config/database.js';

async function main() {
  const latestProject = await prisma.project.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (!latestProject) return console.log('no project');
  
  console.log('Testing research planner for', latestProject.id);
  const plan = await researchPlannerAgent.generatePlan(latestProject.id);
  console.log(JSON.stringify(plan, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
