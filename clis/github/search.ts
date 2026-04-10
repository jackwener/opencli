import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'github',
  name: 'search',
  description: '搜索 GitHub 仓库',
  domain: 'github.com',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'query',
      type: 'str',
      required: true,
      positional: true,
      help: '搜索关键词',
    },
    {
      name: 'limit',
      type: 'int',
      default: 30,
    },
  ],
  columns: ['rank', 'name', 'full_name', 'description', 'stars', 'language', 'url'],
  func: async (_page, kwargs) => {
    const encodedQuery = encodeURIComponent(kwargs.query);
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodedQuery}&per_page=${kwargs.limit}`
    );
    const data = await res.json();

    if ((data as any).message) {
      throw new Error(`Search failed: ${(data as any).message}`);
    }

    return ((data as any).items || [])
      .slice(0, kwargs.limit)
      .map((item: any, i: number) => ({
        rank: i + 1,
        name: item.name || '',
        full_name: item.full_name || '',
        description: (item.description || '').substring(0, 100), // 限制描述长度
        stars: item.stargazers_count || 0,
        language: item.language || '',
        url: item.html_url || '',
      }));
  },
});