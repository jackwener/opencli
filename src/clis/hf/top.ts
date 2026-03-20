import { cli, Strategy } from '../../registry.js';
import { CliError } from '../../errors.js';

interface PaperAuthor {
  name: string;
}

interface DailyPaper {
  paper: {
    id: string;
    upvotes: number;
    authors: PaperAuthor[];
  };
  title: string;
  numComments: number;
}

interface PeriodPaper {
  id: string;
  title: string;
  upvotes: number;
  publishedAt: string;
  authors: PaperAuthor[];
}

function formatAuthors(authors: PaperAuthor[], max = 3): string {
  const names = authors.map((a) => a.name);
  if (names.length <= max) return names.join(', ');
  return names.slice(0, max).join(', ') + ' et al.';
}

cli({
  site: 'hf',
  name: 'top',
  description: 'Top upvoted Hugging Face papers',
  domain: 'huggingface.co',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'limit', type: 'int', default: 20, help: 'Number of papers' },
    { name: 'date', type: 'str', required: false, help: 'Date (YYYY-MM-DD), defaults to most recent' },
    { name: 'period', type: 'str', default: 'daily', choices: ['daily', 'weekly', 'monthly'], help: 'Time period: daily, weekly, or monthly' },
  ],
  func: async (_page, kwargs) => {
    const period = String(kwargs.period ?? 'daily');
    const endpoint = process.env.HF_ENDPOINT?.replace(/\/+$/, '') || 'https://huggingface.co';

    if (period === 'weekly' || period === 'monthly') {
      if (kwargs.date) {
        throw new CliError('INVALID_ARG', `--date is not supported for ${period} period`, `Omit --date when using --period ${period}`);
      }
      const url = `${endpoint}/api/papers?period=${period}`;
      const res = await fetch(url);
      if (!res.ok) throw new CliError('FETCH_ERROR', `HF API error: ${res.status} ${res.statusText}`, 'Check HF_ENDPOINT or try again later');
      const body = await res.json();
      if (!Array.isArray(body)) throw new CliError('FETCH_ERROR', 'Unexpected HF API response', 'Check endpoint');
      const data: PeriodPaper[] = body;
      const sorted = [...data].sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0));
      return sorted.slice(0, Number(kwargs.limit)).map((item, i) => ({
        rank: i + 1,
        title: item.title ?? '',
        upvotes: item.upvotes ?? 0,
        authors: formatAuthors(item.authors ?? []),
      }));
    }

    // daily
    if (kwargs.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(kwargs.date))) {
      throw new CliError('INVALID_ARG', `Invalid date format: ${kwargs.date}`, 'Use YYYY-MM-DD');
    }
    const url = kwargs.date
      ? `${endpoint}/api/daily_papers?date=${kwargs.date}`
      : `${endpoint}/api/daily_papers`;
    const res = await fetch(url);
    if (!res.ok) throw new CliError('FETCH_ERROR', `HF API error: ${res.status} ${res.statusText}`, 'Check HF_ENDPOINT or try again later');
    const body = await res.json();
    if (!Array.isArray(body)) throw new CliError('FETCH_ERROR', 'Unexpected HF API response', 'Check date format or endpoint');
    const data: DailyPaper[] = body;
    const sorted = [...data].sort((a, b) => (b.paper?.upvotes ?? 0) - (a.paper?.upvotes ?? 0));
    return sorted.slice(0, Number(kwargs.limit)).map((item, i) => ({
      rank: i + 1,
      title: item.title ?? '',
      upvotes: item.paper?.upvotes ?? 0,
      comments: item.numComments ?? 0,
      authors: formatAuthors(item.paper?.authors ?? []),
    }));
  },
});
