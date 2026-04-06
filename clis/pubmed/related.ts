/**
 * PubMed Related Articles Adapter
 *
 * Find articles related to a specific PubMed article.
 * Uses ELink API with "neighbor" command to find similar articles.
 *
 * API Documentation:
 * - ELink: https://www.ncbi.nlm.nih.gov/books/NBK25499/#chapter4.ELink
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import {
  eutilsFetch,
  extractAuthors,
  extractDoi,
  buildPubMedUrl,
  truncateText,
} from './utils.js';

cli({
  site: 'pubmed',
  name: 'related',
  description: 'Find articles related to a PubMed article',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'pmid',
      type: 'string',
      required: true,
      positional: true,
      help: 'PubMed ID (e.g., "37780221")',
    },
    {
      name: 'limit',
      type: 'int',
      default: 20,
      help: 'Maximum number of results (max 100)',
    },
    {
      name: 'score',
      type: 'boolean',
      default: false,
      help: 'Show similarity scores',
    },
  ],
  columns: [
    'rank',
    'pmid',
    'title',
    'authors',
    'journal',
    'year',
    'score',
    'doi',
    'url',
  ],
  func: async (_page, args) => {
    const pmid = args.pmid.trim();
    const limit = Math.min(Math.max(1, Number(args.limit)), 100);

    // Validate PMID format
    if (!/^\d+$/.test(pmid)) {
      throw new CliError(
        'INVALID_ARGUMENT',
        `Invalid PMID format: ${pmid}`,
        'PMID should be a numeric string (e.g., "37780221")'
      );
    }

    // Use ELink neighbor_score to get related articles with similarity scores
    const elinkResult = await eutilsFetch('elink', {
      id: pmid,
      dbfrom: 'pubmed',
      cmd: 'neighbor_score',
      linkname: 'pubmed_pubmed',
    });

    // Extract linked PMIDs with scores
    const linkSet = elinkResult.linksets?.[0];
    if (!linkSet) {
      throw new CliError(
        'NOT_FOUND',
        `No related articles found for PMID ${pmid}`,
        'The PMID may be incorrect or the article has no related articles'
      );
    }

    const linkSetDbs = linkSet.linksetdbs;
    if (!linkSetDbs || !Array.isArray(linkSetDbs) || linkSetDbs.length === 0) {
      throw new CliError(
        'NOT_FOUND',
        `No related articles found for PMID ${pmid}`,
        'This article has no related articles in PubMed'
      );
    }

    // Get the links from the linksetdb
    // ELink neighbor_score returns: links = [{ id: "12345", score: 41208390 }, ...]
    const rawLinks: Array<{ id: string; score?: number } | string> = linkSetDbs[0].links;
    if (!rawLinks || !Array.isArray(rawLinks) || rawLinks.length === 0) {
      throw new CliError(
        'NOT_FOUND',
        `No related articles found for PMID ${pmid}`,
        'This article has no related articles in PubMed'
      );
    }

    // Normalize to { id, score } objects (ELink may return strings or objects)
    const normalizedLinks: Array<{ id: string; score: number }> = rawLinks.map(link => {
      if (typeof link === 'string') return { id: link, score: 0 };
      return { id: String(link.id), score: Number(link.score) || 0 };
    });

    // Filter out the original PMID (ELink sometimes includes it as rank 1)
    const filteredLinks = normalizedLinks.filter(link => link.id !== pmid);

    // Apply limit after filtering
    const limitedLinks = filteredLinks.slice(0, limit);

    // Get article details using ESummary
    const pmids = limitedLinks.map(l => l.id).join(',');
    const esummaryResult = await eutilsFetch('esummary', {
      id: pmids,
    });

    const articles = esummaryResult.result;
    if (!articles || typeof articles !== 'object') {
      throw new CliError(
        'PARSE_ERROR',
        'Failed to parse article data from PubMed',
        'The API response format may have changed'
      );
    }

    // Process results
    const results = limitedLinks.map(({ id: linkedPmid, score }, index: number) => {
      const article = articles[linkedPmid];
      if (!article) {
        return null;
      }

      const title = article.title || '';
      const authors = extractAuthors(article.authors, 3);
      const journal = article.fulljournalname || article.source || '';
      const year = article.pubdate?.split(' ')?.[0] || '';
      const doi = extractDoi(article.articleids);

      return {
        rank: index + 1,
        pmid: linkedPmid,
        title: truncateText(title.replace(/\.$/, ''), 100),
        authors,
        journal: truncateText(journal, 50),
        year,
        score: args.score ? String(score) : '',
        doi,
        url: buildPubMedUrl(linkedPmid),
      };
    });

    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  },
});
