/**
 * PubMed Citations Adapter
 *
 * Get citation relationships for a PubMed article:
 * - "cited by": Articles that cite this article
 * - "references": Articles cited by this article
 *
 * Uses ELink API to retrieve citation relationships.
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
  name: 'citations',
  description: 'Get citation relationships (cited by / references) for a PubMed article',
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
      name: 'direction',
      type: 'string',
      default: 'citedby',
      help: 'Citation direction: citedby (articles citing this) or references (articles cited by this)',
    },
    {
      name: 'limit',
      type: 'int',
      default: 20,
      help: 'Maximum number of results (max 100)',
    },
  ],
  columns: [
    'rank',
    'pmid',
    'title',
    'authors',
    'journal',
    'year',
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

    // Validate direction
    if (!['citedby', 'references'].includes(args.direction)) {
      throw new CliError(
        'INVALID_ARGUMENT',
        `Invalid direction: ${args.direction}`,
        'Direction must be "citedby" or "references"'
      );
    }

    // Use ELink to get citation relationships
    const elinkParams: Record<string, string> = {
      id: pmid,
      cmd: 'neighbor',
    };

    // Set database from/to based on direction
    if (args.direction === 'citedby') {
      // Articles that cite this article
      elinkParams.dbfrom = 'pubmed';
      elinkParams.linkname = 'pubmed_pubmed_citedin';
    } else {
      // Articles cited by this article
      elinkParams.dbfrom = 'pubmed';
      elinkParams.linkname = 'pubmed_pubmed_refs';
    }

    const elinkResult = await eutilsFetch('elink', elinkParams);

    // Extract linked PMIDs
    const linkSet = elinkResult.linksets?.[0];
    if (!linkSet) {
      throw new CliError(
        'NOT_FOUND',
        `No citation data found for PMID ${pmid}`,
        'The article may not have citation relationships or the PMID is incorrect'
      );
    }

    const linkSetDbs = linkSet.linksetdbs;
    if (!linkSetDbs || !Array.isArray(linkSetDbs) || linkSetDbs.length === 0) {
      const directionText = args.direction === 'citedby' ? 'cited by any articles' : 'any references';
      throw new CliError(
        'NOT_FOUND',
        `This article is not ${directionText} in PubMed`,
        'Try the other direction or check the PMID'
      );
    }

    // Get the links from the first (and usually only) linksetdb
    const links = linkSetDbs[0].links;
    if (!links || !Array.isArray(links) || links.length === 0) {
      const directionText = args.direction === 'citedby' ? 'cited by any articles' : 'any references';
      throw new CliError(
        'NOT_FOUND',
        `This article is not ${directionText} in PubMed`,
        'Try the other direction or check the PMID'
      );
    }

    // Limit results
    const pmidList = links.slice(0, limit);

    // Get article details using ESummary
    const pmids = pmidList.join(',');
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
    const results = pmidList.map((linkedPmid: string, index: number) => {
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
        doi,
        url: buildPubMedUrl(linkedPmid),
      };
    });

    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  },
});
