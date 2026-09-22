import { intakeAgent } from '../../src/agents/intake.agent.js';
import { env } from '../../src/config/environment.js';

async function main() {
  const brief = 'Business Category: Coffee Shop. Budget: 200000000. Target Location: Jl. Kemang Raya No. 1';
  try {
    env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';
    const res = await intakeAgent.processBrief('mock-client-id', brief);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("CAUGHT ERROR:", err);
  }
}

main();
