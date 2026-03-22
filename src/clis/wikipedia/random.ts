import { CliError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';
import { wikiFetch } from './utils.js';

cli({
  site: 'wikipedia',
  name: 'random',
  description: 'Get a random Wikipedia article',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [{ name: 'lang', default: 'en', help: 'Language code (e.g. en, zh, ja)' }],
  columns: ['title', 'description', 'extract', 'url'],
  func: async (_page, args) => {
    const lang = args.lang || 'en';
    const data = (await wikiFetch(lang, '/api/rest_v1/page/random/summary')) as {
      title?: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (!data?.title) throw new CliError('NOT_FOUND', 'No random article returned', 'Try again');
    return [
      {
        title: data.title,
        description: data.description ?? '-',
        extract: (data.extract ?? '').slice(0, 300),
        url: data.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org`,
      },
    ];
  },
});
