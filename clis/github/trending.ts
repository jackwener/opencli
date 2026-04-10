import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';

interface TrendingItem {
  name: string;
  description: string;
  language: string;
  stars: string;
  forks: string;
  starsToday: string;
}

async function extractTrending(page: IPage, language: string, since: string): Promise<TrendingItem[]> {
  const lang = language ? `/${language}` : '';
  const url = `https://github.com/trending${lang}?since=${since}`;
  await page.goto(url);

  const data = await page.evaluate(`
    (() => {
      const repos = [];
      const articles = document.querySelectorAll('article.Box-row');

      articles.forEach((article) => {
        const h2 = article.querySelector('h2 a');
        const repoName = (h2?.getAttribute('href') || '').replace('/', '');

        const descElem = article.querySelector('p.col-9');
        const description = (descElem?.textContent || '').trim();

        const langElem = article.querySelector('[itemprop="programmingLanguage"]');
        const language = (langElem?.textContent || '').trim();

        const starsElem = article.querySelector('a[href*="/stargazers"]');
        const stars = (starsElem?.textContent || '0').trim();

        const forksElem = article.querySelector('a[href*="/forks"]');
        const forks = (forksElem?.textContent || '0').trim();

        const starsTodayElem = article.querySelector('span.float-sm-right');
        const starsToday = (starsTodayElem?.textContent || '')
          .trim()
          .replace(/stars (today|this week|this month)/i, '')
          .trim();

        repos.push({
          name: repoName,
          description,
          language,
          stars,
          forks,
          starsToday,
        });
      });

      return repos;
    })()
  `) as TrendingItem[];

  return data;
}

cli({
  site: 'github',
  name: 'trending',
  description: 'GitHub Trending 热门项目',
  domain: 'github.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  args: [
    {
      name: 'language',
      type: 'str',
      default: '',
      help: '编程语言筛选（如 javascript, python, go）',
    },
    {
      name: 'since',
      type: 'str',
      default: 'daily',
      help: '时间范围（daily, weekly, monthly）',
    },
    {
      name: 'limit',
      type: 'int',
      default: 25,
    },
  ],
  columns: ['rank', 'name', 'description', 'language', 'stars', 'forks', 'stars_today'],
  func: async (page, kwargs) => {
    const data = await extractTrending(page, kwargs.language || '', kwargs.since || 'daily');
    return data.slice(0, kwargs.limit).map((item, i) => ({
      rank: i + 1,
      name: item.name || '',
      description: item.description || '',
      language: item.language || '',
      stars: item.stars || '0',
      forks: item.forks || '0',
      stars_today: item.starsToday || '',
    }));
  },
});