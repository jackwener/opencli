/**
 * PubMed Article Details Adapter
 *
 * Get detailed information about a specific PubMed article by PMID.
 * Uses EFetch API (XML) for full article details including abstract,
 * MeSH terms, keywords, and author affiliations.
 *
 * API Documentation:
 * - EFetch: https://www.ncbi.nlm.nih.gov/books/NBK25499/#chapter4.EFetch
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import {
  eutilsFetchText,
  buildPubMedUrl,
  truncateText,
  prioritizeArticleType,
} from './utils.js';

/**
 * Parse EFetch XML response to extract full article details
 */
function parseEFetchXml(xml: string, pmid: string) {
  // Helper: extract text content between tags
  const getTag = (src: string, tag: string): string => {
    const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
  };

  const getAllTags = (src: string, tag: string): string[] => {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi');
    const results: string[] = [];
    let m;
    while ((m = re.exec(src)) !== null) {
      results.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
    return results;
  };

  // Abstract - may have multiple AbstractText sections (structured abstract)
  const abstractParts = getAllTags(xml, 'AbstractText');
  const abstract = abstractParts.join(' ').replace(/\s+/g, ' ').trim();

  // Title
  const title = getTag(xml, 'ArticleTitle');

  // Journal
  const journalTitle = getTag(xml, 'Title');
  const isoAbbreviation = getTag(xml, 'ISOAbbreviation');
  const volume = getTag(xml, 'Volume');
  const issue = getTag(xml, 'Issue');
  const pagination = getTag(xml, 'MedlinePgn');

  // Publication date - must extract from JournalIssue/PubDate, not DateCompleted/DateRevised
  const journalIssueMatch = xml.match(/<JournalIssue[^>]*>([\s\S]*?)<\/JournalIssue>/i);
  const journalIssue = journalIssueMatch ? journalIssueMatch[1] : '';
  const pubDateMatch = journalIssue.match(/<PubDate>([\s\S]*?)<\/PubDate>/i);
  const pubDate = pubDateMatch ? pubDateMatch[1] : '';

  const year = getTag(pubDate, 'Year') || getTag(xml, 'MedlineDate').slice(0, 4);
  const month = getTag(pubDate, 'Month');
  const day = getTag(pubDate, 'Day');
  const fullDate = [year, month, day].filter(Boolean).join(' ');

  // Authors and affiliations - collect all affiliations for each author
  const authorBlocks = xml.match(/<Author[^>]*>([\s\S]*?)<\/Author>/gi) || [];
  const authors: Array<{ name: string; affiliations: string[] }> = authorBlocks.map(block => {
    const lastName = getTag(block, 'LastName');
    const foreName = getTag(block, 'ForeName') || getTag(block, 'Initials');
    const collectiveName = getTag(block, 'CollectiveName');
    const name = collectiveName || `${lastName} ${foreName}`.trim();
    // Get all affiliations for this author (an author can have multiple AffiliationInfo blocks)
    const affiliationBlocks = block.match(/<AffiliationInfo>([\s\S]*?)<\/AffiliationInfo>/gi) || [];
    const affiliations = affiliationBlocks
      .map(info => getTag(info, 'Affiliation'))
      .filter(Boolean);
    return { name, affiliations };
  });

  const firstAuthor = authors[0] || { name: '', affiliations: [] };
  const correspondingAuthor = authors[authors.length - 1] || { name: '', affiliations: [] };

  // Unique affiliations - flatten all author affiliations and deduplicate
  const allAffiliations = authors.flatMap(a => a.affiliations);
  const uniqueAffiliations = [...new Set(allAffiliations)];

  // MeSH terms
  const meshBlocks = xml.match(/<MeshHeading>([\s\S]*?)<\/MeshHeading>/gi) || [];
  const meshTerms = meshBlocks
    .map(block => getTag(block, 'DescriptorName'))
    .filter(Boolean)
    .slice(0, 10);

  // Keywords
  const keywords = getAllTags(xml, 'Keyword').filter(Boolean).slice(0, 10);

  // Article type - PubMed returns multiple types, prioritize more specific ones
  const pubTypes = getAllTags(xml, 'PublicationType').filter(Boolean);
  const articleType = prioritizeArticleType(pubTypes);

  // Language
  const language = getTag(xml, 'Language');

  // IDs: DOI
  const doiMatch = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/i);
  const doi = doiMatch ? doiMatch[1].trim() : '';

  const pmcMatch = xml.match(/<ArticleId IdType="pmc">([^<]+)<\/ArticleId>/i);
  const pmcId = pmcMatch ? pmcMatch[1].trim() : '';

  // Build author list with their affiliations for detailed view
  const authorListWithAffiliations = authors.map(a => ({
    name: a.name,
    affiliations: a.affiliations,
  }));

  // Simple author name list for compact display
  const authorNameList = authors.map(a => a.name);

  return {
    pmid,
    title,
    abstract,
    authors: {
      list: authorListWithAffiliations,
      names: authorNameList,
      all: authorNameList.slice(0, 10).join(', ') + (authorNameList.length > 10 ? ', et al.' : ''),
      first: firstAuthor.name,
      firstWithAffiliations: {
        name: firstAuthor.name,
        affiliations: firstAuthor.affiliations,
      },
      corresponding: correspondingAuthor.name,
      correspondingWithAffiliations: {
        name: correspondingAuthor.name,
        affiliations: correspondingAuthor.affiliations,
      },
      count: authors.length,
      affiliations: uniqueAffiliations,
    },
    journal: {
      title: journalTitle,
      isoAbbreviation,
      volume,
      issue,
      pagination,
    },
    publication: {
      year,
      fullDate,
    },
    ids: {
      pmid,
      doi,
      pmc: pmcId,
    },
    classification: {
      articleType,
      pubTypes,
      language,
      meshTerms,
      keywords,
    },
    url: buildPubMedUrl(pmid),
  };
}

cli({
  site: 'pubmed',
  name: 'article',
  description: 'Get detailed information about a PubMed article by PMID (full abstract, MeSH terms, affiliations)',
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
      name: 'output',
      type: 'string',
      default: 'table',
      help: 'Output format: table (summary) or json (full details)',
    },
    {
      name: 'full-abstract',
      type: 'boolean',
      default: false,
      help: 'Show full abstract without truncation (table output only)',
    },
  ],
  columns: ['field', 'value'],
  func: async (_page, args) => {
    const pmid = args.pmid.trim();

    if (!/^\d+$/.test(pmid)) {
      throw new CliError(
        'INVALID_ARGUMENT',
        `Invalid PMID format: ${pmid}`,
        'PMID should be a numeric string (e.g., "37780221")'
      );
    }

    // Use EFetch to get full article details (XML includes abstract, MeSH, affiliations)
    const xml = await eutilsFetchText('efetch', {
      id: pmid,
      rettype: 'abstract',
      retmode: 'xml',
    });

    if (!xml || xml.includes('<ERROR>') || !xml.includes('<PubmedArticle>')) {
      throw new CliError(
        'NOT_FOUND',
        `Article with PMID ${pmid} not found`,
        'Check the PMID and try again'
      );
    }

    const article = parseEFetchXml(xml, pmid);

    if (args.output === 'json') {
      return [{
        field: 'data',
        value: JSON.stringify(article, null, 2),
      }];
    }

    // Table format - reorganized sections
    // Helper: extract email from affiliation text
    const extractEmail = (affil: string): string => {
      const emailMatch = affil.match(/[\w.-]+@[\w.-]+\.\w+/);
      return emailMatch ? emailMatch[0] : '';
    };

    const firstAuthor = article.authors.firstWithAffiliations;
    const corrAuthor = article.authors.correspondingWithAffiliations;
    const corrEmail = corrAuthor.affiliations.map(extractEmail).filter(Boolean)[0] || 'N/A';

    const rows: Array<{ field: string; value: string }> = [
      { field: 'PMID', value: article.pmid },
      { field: 'Title', value: article.title },
      { field: '---', value: '---' },
      { field: 'Section', value: '第一作者及通讯作者信息' },
      { field: 'First Author', value: firstAuthor.name },
      { field: 'First Author Affiliations', value: firstAuthor.affiliations.join('; ') || 'N/A' },
      { field: 'Corresponding Author', value: corrAuthor.name },
      { field: 'Corresponding Author Affiliations', value: corrAuthor.affiliations.join('; ') || 'N/A' },
      { field: 'Corresponding Author Email', value: corrEmail },
      { field: '---', value: '---' },
      { field: 'Section', value: '所有作者信息' },
    ];

    // Add each author with their affiliations
    article.authors.list.forEach((author, index) => {
      rows.push({
        field: `${index + 1}. ${author.name}`,
        value: author.affiliations.join('; ') || 'N/A',
      });
    });

    rows.push(
      { field: '---', value: '---' },
      { field: 'Section', value: '期刊信息' },
      { field: 'Journal', value: article.journal.title || article.journal.isoAbbreviation },
      { field: 'Year', value: article.publication.year },
      { field: 'Volume/Issue', value: `${article.journal.volume}${article.journal.issue ? `(${article.journal.issue})` : ''}` },
      { field: 'Pages', value: article.journal.pagination },
      { field: 'DOI', value: article.ids.doi || 'N/A' },
      { field: 'PMC ID', value: article.ids.pmc || 'N/A' },
      { field: '---', value: '---' },
      { field: 'Section', value: '文章分类' },
      { field: 'Article Type', value: article.classification.articleType },
      { field: 'Language', value: article.classification.language },
      { field: 'MeSH Terms', value: article.classification.meshTerms.join(', ') || 'N/A' },
      { field: 'Keywords', value: article.classification.keywords.join(', ') || 'N/A' },
      { field: '---', value: '---' },
      { field: 'Section', value: '摘要' },
      { field: 'Abstract', value: args['full-abstract'] ? article.abstract || 'N/A' : truncateText(article.abstract, 400) || 'N/A' },
      { field: '---', value: '---' },
      { field: 'URL', value: article.url }
    );

    return rows;
  },
});
