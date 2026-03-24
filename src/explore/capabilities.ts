/**
 * Capability inference from analyzed endpoints.
 */

import type { AnalyzedEndpoint, InferredCapability, DiscoveredStore } from './types.js';
import { detectSiteName } from './site.js';

/**
 * Infer a human-readable capability name from a URL or explicit goal.
 */
export function inferCapabilityName(url: string, goal?: string): string {
  if (goal) return goal;
  const u = url.toLowerCase();
  if (u.includes('hot') || u.includes('popular') || u.includes('ranking') || u.includes('trending')) return 'hot';
  if (u.includes('search')) return 'search';
  if (u.includes('feed') || u.includes('timeline') || u.includes('dynamic')) return 'feed';
  if (u.includes('comment') || u.includes('reply')) return 'comments';
  if (u.includes('history')) return 'history';
  if (u.includes('profile') || u.includes('userinfo') || u.includes('/me')) return 'me';
  if (u.includes('favorite') || u.includes('collect') || u.includes('bookmark')) return 'favorite';
  try {
    const segs = new URL(url).pathname.split('/').filter(s => s && !s.match(/^\d+$/) && !s.match(/^[0-9a-f]{8,}$/i));
    if (segs.length) return segs[segs.length - 1].replace(/[^a-z0-9]/gi, '_').toLowerCase();
  } catch {}
  return 'data';
}

/**
 * Infer an authentication strategy from auth indicators.
 */
export function inferStrategy(authIndicators: string[]): string {
  if (authIndicators.includes('signature')) return 'intercept';
  if (authIndicators.includes('bearer') || authIndicators.includes('csrf')) return 'header';
  return 'cookie';
}

/**
 * Infer CLI capabilities from analyzed endpoints and discovered stores.
 */
export function inferCapabilitiesFromEndpoints(
  endpoints: AnalyzedEndpoint[],
  stores: DiscoveredStore[],
  opts: { site?: string; goal?: string; url: string },
): { capabilities: InferredCapability[]; topStrategy: string; authIndicators: string[] } {
  const capabilities: InferredCapability[] = [];
  const usedNames = new Set<string>();

  for (const ep of endpoints.slice(0, 8)) {
    let capName = inferCapabilityName(ep.url, opts.goal);
    if (usedNames.has(capName)) {
      const suffix = ep.pattern.split('/').filter(s => s && !s.startsWith('{') && !s.includes('.')).pop();
      capName = suffix ? `${capName}_${suffix}` : `${capName}_${usedNames.size}`;
    }
    usedNames.add(capName);

    const cols: string[] = [];
    if (ep.responseAnalysis) {
      for (const role of ['title', 'url', 'author', 'score', 'time']) {
        if (ep.responseAnalysis.detectedFields[role]) cols.push(role);
      }
    }

    const args: InferredCapability['recommendedArgs'] = [];
    if (ep.hasSearchParam) args.push({ name: 'keyword', type: 'str', required: true });
    args.push({ name: 'limit', type: 'int', required: false, default: 20 });
    if (ep.hasPaginationParam) args.push({ name: 'page', type: 'int', required: false, default: 1 });

    const epStrategy = inferStrategy(ep.authIndicators);
    let storeHint: { store: string; action: string } | undefined;
    if ((epStrategy === 'intercept' || ep.authIndicators.includes('signature')) && stores.length > 0) {
      for (const s of stores) {
        const matchingAction = s.actions.find(a =>
          capName.split('_').some(part => a.toLowerCase().includes(part)) ||
          a.toLowerCase().includes('fetch') || a.toLowerCase().includes('get')
        );
        if (matchingAction) { storeHint = { store: s.id, action: matchingAction }; break; }
      }
    }

    capabilities.push({
      name: capName, description: `${opts.site ?? detectSiteName(opts.url)} ${capName}`,
      strategy: storeHint ? 'store-action' : epStrategy,
      confidence: Math.min(ep.score / 20, 1.0), endpoint: ep.pattern,
      itemPath: ep.responseAnalysis?.itemPath ?? null,
      recommendedColumns: cols.length ? cols : ['title', 'url'],
      recommendedArgs: args,
      ...(storeHint ? { storeHint } : {}),
    });
  }

  const allAuth = new Set(endpoints.flatMap(ep => ep.authIndicators));
  const topStrategy = allAuth.has('signature') ? 'intercept'
    : allAuth.has('bearer') || allAuth.has('csrf') ? 'header'
    : allAuth.size === 0 ? 'public' : 'cookie';

  return { capabilities, topStrategy, authIndicators: [...allAuth] };
}
