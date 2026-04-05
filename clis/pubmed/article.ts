/**
 * PubMed Article Details Adapter
 *
 * Get detailed information about a specific PubMed article by PMID.
 * Uses EFetch API to retrieve full metadata including abstract, authors,
 * affiliations, MeSH terms, funding info, and more.
 *
 * API Documentation:
 * - EFetch: https://www.ncbi.nlm.nih.gov/books/NBK25499/#chapter4.EFetch
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import {
  eutilsFetch,
  extractAuthors,
  extractFirstAuthor,
  extractCorrespondingAuthor,
  extractAffiliations,
  extractMeshTerms,
  extractKeywords,
  extractDoi,
  extractPmcId,
  buildPubMedUrl,
  truncateText,
  formatArticleType,
  extractJournalInfo,
} from './utils.js';

cli({
  site: 'pubmed',
  name: 'article',
  description: 'Get detailed information about a PubMed article by PMID',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'pmid',
      type: 'string',
      required: true,
      positional: true,
      help: 'PubMed ID (e.g., "37780221", "37158692")',
    },
    {
      name: 'format',
      type: 'string',
      default: 'table',
      help: 'Output format: table (summary) or json (full details)',
    },
  ],
  columns: [
    'field',
    'value',
  ],
  func: async (_page, args) => {
    const pmid = args.pmid.trim();

    // Validate PMID format
    if (!/^\d+$/.test(pmid)) {
      throw new CliError(
        'INVALID_ARGUMENT',
        `Invalid PMID format: ${pmid}`,
        'PMID should be a numeric string (e.g., "37780221")'
      );
    }

    // Use EFetch to get full article details
    const efetchResult = await eutilsFetch('efetch', {
      id: pmid,
      rettype: 'abstract',
    });

    // Parse the article data from the result
    const articleSet = efetchResult.PubmedArticleSet;
    if (!articleSet || !Array.isArray(articleSet) || articleSet.length === 0) {
      throw new CliError(
        'NOT_FOUND',
        `Article with PMID ${pmid} not found`,
        'Check the PMID and try again'
      );
    }

    const pubmedArticle = articleSet[0].MedlineCitation;
    if (!pubmedArticle) {
      throw new CliError(
        'NOT_FOUND',
        `Article with PMID ${pmid} not found`,
        'The article may have been removed or the PMID is incorrect'
      );
    }

    const article = pubmedArticle.Article;
    const medlineJournalInfo = pubmedArticle.MedlineJournalInfo;
    const pubmedData = articleSet[0].PubmedData;

    // Extract basic info
    const title = article?.ArticleTitle || '';
    const abstract = article?.Abstract?.AbstractText || '';
    const abstractText = Array.isArray(abstract)
      ? abstract.map((a: any) => a.value || a).join(' ')
      : abstract;

    // Extract authors and affiliations
    const authorList = article?.AuthorList;
    const allAuthors = extractAuthors(authorList, 10);
    const firstAuthor = extractFirstAuthor(authorList);
    const correspondingAuthor = extractCorrespondingAuthor(authorList);
    const affiliations = extractAffiliations(authorList);

    // Extract journal info
    const journal = article?.Journal;
    const journalInfo = extractJournalInfo(journal);
    const journalTitle = journalInfo.title || medlineJournalInfo?.MedlineTA || '';
    const isoAbbreviation = journalInfo.isoAbbreviation || '';

    // Extract publication date
    const journalIssue = journal?.JournalIssue;
    const pubDate = journalIssue?.PubDate;
    const year = pubDate?.Year || medlineJournalInfo?.DateCompleted?.Year || '';
    const month = pubDate?.Month || '';
    const day = pubDate?.Day || '';
    const fullDate = [year, month, day].filter(Boolean).join(' ');

    // Extract volume, issue, pages
    const volume = journalIssue?.Volume || '';
    const issue = journalIssue?.Issue || '';
    const pagination = article?.Pagination?.MedlinePgn || '';

    // Extract article IDs
    const articleIdList = pubmedData?.ArticleIdList;
    const doi = extractDoi(articleIdList);
    const pmcId = extractPmcId(articleIdList);

    // Extract MeSH terms and keywords
    const meshHeadings = pubmedArticle.MeshHeading;
    const meshTerms = extractMeshTerms(meshHeadings);

    const keywordList = article?.KeywordList;
    const keywords = extractKeywords(keywordList);

    // Extract article type
    const publicationTypeList = article?.PublicationTypeList;
    const articleType = formatArticleType(publicationTypeList);

    // Extract language
    const language = article?.Language?.[0] || '';

    // If JSON format requested, return full structured data
    if (args.format === 'json') {
      return [{
        field: 'data',
        value: JSON.stringify({
          pmid,
          title,
          abstract: abstractText,
          authors: {
            all: allAuthors,
            first: firstAuthor,
            corresponding: correspondingAuthor,
            count: authorList?.length || 0,
          },
          affiliations,
          journal: {
            title: journalTitle,
            isoAbbreviation,
            volume,
            issue,
            pagination,
          },
          publication: {
            year,
            month,
            day,
            fullDate,
          },
          ids: {
            pmid,
            doi,
            pmc: pmcId,
          },
          classification: {
            articleType,
            language,
            meshTerms,
            keywords,
          },
          url: buildPubMedUrl(pmid),
        }, null, 2),
      }];
    }

    // Table format - return key-value pairs
    const rows: Array<{ field: string; value: string }> = [
      { field: 'PMID', value: pmid },
      { field: 'Title', value: title },
      { field: 'First Author', value: firstAuthor },
      { field: 'Corresponding Author', value: correspondingAuthor },
      { field: 'All Authors', value: truncateText(allAuthors, 100) },
      { field: 'Journal', value: journalTitle },
      { field: 'Year', value: year },
      { field: 'Volume/Issue', value: `${volume}${issue ? `(${issue})` : ''}` },
      { field: 'Pages', value: pagination },
      { field: 'DOI', value: doi || 'N/A' },
      { field: 'PMC ID', value: pmcId || 'N/A' },
      { field: 'Article Type', value: articleType },
      { field: 'Language', value: language },
      { field: 'MeSH Terms', value: meshTerms.join(', ') || 'N/A' },
      { field: 'Keywords', value: keywords.join(', ') || 'N/A' },
      { field: 'Abstract', value: truncateText(abstractText, 300) || 'N/A' },
      { field: 'URL', value: buildPubMedUrl(pmid) },
    ];

    // Add affiliations if available
    if (affiliations.length > 0) {
      rows.splice(5, 0, { field: 'Affiliations', value: truncateText(affiliations.slice(0, 3).join('; '), 150) });
    }

    return rows;
  },
});
