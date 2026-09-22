interface OpenRouterModels {
  data: Array<{ id: string }>;
}

async function main() {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const body = (await res.json()) as OpenRouterModels;
  const freeModels = body.data.filter((m) => m.id.endsWith(':free')).map((m) => m.id);
  console.log(freeModels);
}
main();
