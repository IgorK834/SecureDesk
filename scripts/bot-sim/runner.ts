import type { ScenarioStore } from './database.ts';
import { protectionResults } from './report.ts';
import type { ScenarioDefinition } from './scenarios.ts';
import type { ScenarioResult } from './types.ts';

export async function runScenarios(
  definitions: ScenarioDefinition[],
  store: ScenarioStore,
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const definition of definitions) {
    store.reset();
    const evidence = await definition.execute();
    const events = store.eventTypes();
    results.push({
      id: definition.id,
      name: definition.name,
      evidence,
      events,
      protections: protectionResults(evidence, events),
    });
  }
  return results;
}
