/**
 * Deep Explore: intelligent API discovery with response analysis.
 *
 * Navigates to the target URL, auto-scrolls to trigger lazy loading,
 * captures network traffic, analyzes JSON responses, and automatically
 * infers CLI capabilities from discovered API endpoints.
 */

import * as path from 'node:path';
import { DEFAULT_BROWSER_EXPLORE_TIMEOUT, browserSession, runWithTimeout } from '../runtime.js';
import type { IBrowserFactory } from '../runtime.js';
import { detectFramework } from '../scripts/framework.js';
import { discoverStores } from '../scripts/store.js';
import { interactFuzz } from '../scripts/interact.js';
import type { IPage } from '../types.js';
import { log } from '../logger.js';

import type { DiscoveredStore, ExploreResult } from './types.js';
import { detectSiteName } from './site.js';
import { parseNetworkRequests } from './network.js';
import { analyzeEndpoints } from './analysis.js';
import { inferCapabilitiesFromEndpoints } from './capabilities.js';
import { writeExploreArtifacts } from './artifacts.js';

// ── Re-exports for public API ──────────────────────────────────────────────
// These are used by generate.ts, synthesize.ts, cli.ts, and external consumers.

export type {
  NetworkEntry,
  AnalyzedEndpoint,
  InferredCapability,
  DiscoveredStore,
  ExploreManifest,
  ExploreAuthSummary,
  ExploreEndpointArtifact,
  ExploreResult,
  ExploreBundle,
  ResponseAnalysis,
} from './types.js';

export { detectSiteName, slugify } from './site.js';
export { parseNetworkRequests, urlToPattern, detectAuthIndicators } from './network.js';
export { analyzeEndpoints, analyzeResponseBody, flattenFields, scoreEndpoint } from './analysis.js';
export { inferCapabilitiesFromEndpoints, inferCapabilityName, inferStrategy } from './capabilities.js';
export { writeExploreArtifacts } from './artifacts.js';

// ── Browser-injected JS (stringified functions) ────────────────────────────

const FRAMEWORK_DETECT_JS = detectFramework.toString();
const STORE_DISCOVER_JS = discoverStores.toString();
const INTERACT_FUZZ_JS = interactFuzz.toString();

// ── Type guard ─────────────────────────────────────────────────────────────

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(v => typeof v === 'boolean');
}

// ── Page metadata ──────────────────────────────────────────────────────────

async function readPageMetadata(page: IPage): Promise<{ url: string; title: string }> {
  try {
    const result = await page.evaluate(`() => ({ url: window.location.href, title: document.title || '' })`);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return {
        url: String((result as Record<string, unknown>).url ?? ''),
        title: String((result as Record<string, unknown>).title ?? ''),
      };
    }
  } catch {}
  return { url: '', title: '' };
}

// ── Main explore function ──────────────────────────────────────────────────

export async function exploreUrl(
  url: string,
  opts: {
    BrowserFactory: new () => IBrowserFactory;
    site?: string; goal?: string; authenticated?: boolean;
    outDir?: string; waitSeconds?: number; query?: string;
    clickLabels?: string[]; auto?: boolean; workspace?: string;
  },
): Promise<ExploreResult> {
  const waitSeconds = opts.waitSeconds ?? 3.0;
  const exploreTimeout = Math.max(DEFAULT_BROWSER_EXPLORE_TIMEOUT, 45.0 + waitSeconds * 8.0);

  return browserSession(opts.BrowserFactory, async (page) => {
    return runWithTimeout((async () => {
      // Step 1: Navigate
      await page.goto(url);
      await page.wait(waitSeconds);

      // Step 2: Auto-scroll to trigger lazy loading intelligently
      await page.autoScroll({ times: 3, delayMs: 1500 }).catch(() => {});

      // Step 2.5: Interactive Fuzzing (if requested)
      if (opts.auto) {
         try {
           // First: targeted clicks by label (e.g. "字幕", "CC", "评论")
           if (opts.clickLabels?.length) {
             for (const label of opts.clickLabels) {
               const safeLabel = JSON.stringify(label);
               await page.evaluate(`
                 (() => {
                   const el = [...document.querySelectorAll('button, [role="button"], [role="tab"], a, span')]
                     .find(e => e.textContent && e.textContent.trim().includes(${safeLabel}));
                   if (el) el.click();
                 })()
               `);
               await page.wait(1);
             }
           }
           // Then: blind fuzzing on generic interactive elements
           const clicks = await page.evaluate(INTERACT_FUZZ_JS);
           await page.wait(2); // wait for XHRs to settle
         } catch (e) {
           log.debug(`Interactive fuzzing skipped: ${e instanceof Error ? e.message : String(e)}`);
         }
      }

      // Step 3: Read page metadata
      const metadata = await readPageMetadata(page);

      // Step 4: Capture network traffic
      const rawNetwork = await page.networkRequests(false);
      const networkEntries = parseNetworkRequests(rawNetwork);

      // Step 5: For JSON endpoints missing a body, carefully re-fetch in-browser via a pristine iframe
      const jsonEndpoints = networkEntries.filter(e => e.contentType.includes('json') && e.method === 'GET' && e.status === 200 && !e.responseBody);
      await Promise.allSettled(jsonEndpoints.slice(0, 5).map(async (ep) => {
        try {
          const body = await page.evaluate(`async () => {
            let iframe = null;
            try {
              iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              document.body.appendChild(iframe);
              const cleanFetch = iframe.contentWindow.fetch || window.fetch;
              const r = await cleanFetch(${JSON.stringify(ep.url)}, { credentials: 'include' });
              if (!r.ok) return null;
              const d = await r.json();
              return JSON.stringify(d).slice(0, 10000);
            } catch {
              return null;
            } finally {
              if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }
          }`);
          if (body && typeof body === 'string') { try { ep.responseBody = JSON.parse(body); } catch {} }
          else if (body && typeof body === 'object') ep.responseBody = body;
        } catch {}
      }));

      // Step 6: Detect framework
      let framework: Record<string, boolean> = {};
      try {
        const fw = await page.evaluate(FRAMEWORK_DETECT_JS);
        if (isBooleanRecord(fw)) framework = fw;
      } catch {}

      // Step 6.5: Discover stores (Pinia / Vuex)
      let stores: DiscoveredStore[] = [];
      if (framework.pinia || framework.vuex) {
        try {
          const raw = await page.evaluate(STORE_DISCOVER_JS);
          if (Array.isArray(raw)) stores = raw;
        } catch {}
      }

      // Step 7+8: Analyze endpoints and infer capabilities
      const { analyzed: analyzedEndpoints, totalCount } = analyzeEndpoints(networkEntries);
      const { capabilities, topStrategy, authIndicators } = inferCapabilitiesFromEndpoints(
        analyzedEndpoints, stores, { site: opts.site, goal: opts.goal, url },
      );

      // Step 9: Assemble result and write artifacts
      const siteName = opts.site ?? detectSiteName(metadata.url || url);
      const targetDir = opts.outDir ?? path.join('.opencli', 'explore', siteName);

      const result = {
        site: siteName, target_url: url, final_url: metadata.url, title: metadata.title,
        framework, stores, top_strategy: topStrategy,
        endpoint_count: totalCount,
        api_endpoint_count: analyzedEndpoints.length,
        capabilities, auth_indicators: authIndicators,
      };

      await writeExploreArtifacts(targetDir, result, analyzedEndpoints, stores);
      return { ...result, out_dir: targetDir };
    })(), { timeout: exploreTimeout, label: `Explore ${url}` });
  }, { workspace: opts.workspace });
}

export function renderExploreSummary(result: ExploreResult): string {
  const lines = [
    'opencli probe: OK', `Site: ${result.site}`, `URL: ${result.target_url}`,
    `Title: ${result.title || '(none)'}`, `Strategy: ${result.top_strategy}`,
    `Endpoints: ${result.endpoint_count} total, ${result.api_endpoint_count} API`,
    `Capabilities: ${result.capabilities?.length ?? 0}`,
  ];
  for (const cap of (result.capabilities ?? []).slice(0, 5)) {
    const storeInfo = cap.storeHint ? ` → ${cap.storeHint.store}.${cap.storeHint.action}()` : '';
    lines.push(`  • ${cap.name} (${cap.strategy}, ${(cap.confidence * 100).toFixed(0)}%)${storeInfo}`);
  }
  const fw = result.framework ?? {};
  const fwNames = Object.entries(fw).filter(([, v]) => v).map(([k]) => k);
  if (fwNames.length) lines.push(`Framework: ${fwNames.join(', ')}`);
  const stores: DiscoveredStore[] = result.stores ?? [];
  if (stores.length) {
    lines.push(`Stores: ${stores.length}`);
    for (const s of stores.slice(0, 5)) {
      lines.push(`  • ${s.type}/${s.id}: ${s.actions.slice(0, 5).join(', ')}${s.actions.length > 5 ? '...' : ''}`);
    }
  }
  lines.push(`Output: ${result.out_dir}`);
  return lines.join('\n');
}
