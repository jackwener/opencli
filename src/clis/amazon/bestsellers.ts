import type { RankingCardPayload } from './rankings.js';
import { cli } from '../../registry.js';
import { createRankingCliOptions, normalizeRankingCandidate } from './rankings.js';

cli(createRankingCliOptions({
  commandName: 'bestsellers',
  listType: 'bestsellers',
  description: 'Amazon Best Sellers pages for category candidate discovery',
}));

export const __test__ = {
  normalizeBestsellerCandidate(
    candidate: RankingCardPayload,
    rank: number,
    listTitle: string | null,
    sourceUrl: string,
  ): Record<string, unknown> {
    return normalizeRankingCandidate(candidate, {
      listType: 'bestsellers',
      rankFallback: rank,
      listTitle,
      sourceUrl,
      categoryTitle: null,
      categoryUrl: sourceUrl,
      categoryPath: [],
      visibleCategoryLinks: [],
    });
  },
};
