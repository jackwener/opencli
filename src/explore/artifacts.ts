/**
 * Write explore artifacts (manifest, endpoints, capabilities, auth, stores) to disk.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AnalyzedEndpoint, DiscoveredStore, ExploreResult } from './types.js';

export async function writeExploreArtifacts(
  targetDir: string,
  result: Omit<ExploreResult, 'out_dir'>,
  analyzedEndpoints: AnalyzedEndpoint[],
  stores: DiscoveredStore[],
): Promise<void> {
  await fs.promises.mkdir(targetDir, { recursive: true });
  const tasks = [
    fs.promises.writeFile(path.join(targetDir, 'manifest.json'), JSON.stringify({
      site: result.site, target_url: result.target_url, final_url: result.final_url, title: result.title,
      framework: result.framework, stores: stores.map(s => ({ type: s.type, id: s.id, actions: s.actions })),
      top_strategy: result.top_strategy, explored_at: new Date().toISOString(),
    }, null, 2)),
    fs.promises.writeFile(path.join(targetDir, 'endpoints.json'), JSON.stringify(analyzedEndpoints.map(ep => ({
      pattern: ep.pattern, method: ep.method, url: ep.url, status: ep.status,
      contentType: ep.contentType, score: ep.score, queryParams: ep.queryParams,
      itemPath: ep.responseAnalysis?.itemPath ?? null, itemCount: ep.responseAnalysis?.itemCount ?? 0,
      detectedFields: ep.responseAnalysis?.detectedFields ?? {}, authIndicators: ep.authIndicators,
    })), null, 2)),
    fs.promises.writeFile(path.join(targetDir, 'capabilities.json'), JSON.stringify(result.capabilities, null, 2)),
    fs.promises.writeFile(path.join(targetDir, 'auth.json'), JSON.stringify({
      top_strategy: result.top_strategy, indicators: result.auth_indicators, framework: result.framework,
    }, null, 2)),
  ];
  if (stores.length > 0) {
    tasks.push(fs.promises.writeFile(path.join(targetDir, 'stores.json'), JSON.stringify(stores, null, 2)));
  }
  await Promise.all(tasks);
}
