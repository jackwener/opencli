import { CliError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';
import { wikiFetch } from './utils.js';

interface WikiArticle {
  title?: string;
  description?: string;
  views?: number;
}

cli({
  site: 'wikipedia',
  name: 'trending',
  description: 'Most-read Wikipedia articles (yesterday)',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'limit', type: 'int', default: 10, help: 'Max results' },
    { name: 'lang', default: 'en', help: 'Language code (e.g. en, zh, ja)' },
  ],
  columns: ['rank', 'title', 'description', 'views'],
  func: async (_page, args) => {
    const lang = args.lang || 'en';
    const limit = Math.max(1, Math.min(Number(args.limit), 50));

    // Wikipedia featured feed uses UTC dates; use yesterday to ensure data availability
    const d = new Date(Date.now() - 86400_000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');

    const data = (await wikiFetch(lang, `/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`)) as {
      mostread?: { articles?: WikiArticle[] };
    };
    const articles = data?.mostread?.articles;
    if (!articles?.length)
      throw new CliError('NOT_FOUND', 'No trending articles available', 'Try a different language with --lang');

    return articles.slice(0, limit).map((a, i) => ({
      rank: i + 1,
      title: a.title ?? '-',
      description: (a.description ?? '-').slice(0, 80),
      views: a.views ?? 0,
    }));
  },
});
