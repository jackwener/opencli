import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'github',
  name: 'pr',
  description: 'GitHub 仓库 Pull Requests 列表',
  domain: 'github.com',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'repo',
      type: 'str',
      required: true,
      positional: true,
      help: '仓库路径（如 jackwener/OpenCLI）',
    },
    {
      name: 'state',
      type: 'str',
      default: 'open',
      help: 'PR 状态（open, closed, all）',
    },
    {
      name: 'limit',
      type: 'int',
      default: 30,
    },
  ],
  columns: ['number', 'title', 'user', 'state', 'draft', 'comments', 'created_at'],
  func: async (_page, kwargs) => {
    const res = await fetch(
      `https://api.github.com/repos/${kwargs.repo}/pulls?state=${kwargs.state}&per_page=${kwargs.limit}`
    );
    const data = await res.json();

    if ((data as any).message === 'Not Found') {
      throw new Error(`Repository not found: ${kwargs.repo}`);
    }

    return (data as any[])
      .slice(0, kwargs.limit)
      .map((item: any) => ({
        number: item.number || 0,
        title: item.title || '',
        user: item.user?.login || '',
        state: item.state || '',
        draft: item.draft || false,
        comments: item.comments || 0,
        created_at: item.created_at || '',
      }));
  },
});