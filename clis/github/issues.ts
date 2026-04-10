import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'github',
  name: 'issues',
  description: 'GitHub 仓库 Issues 列表',
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
      help: 'Issue 状态（open, closed, all）',
    },
    {
      name: 'limit',
      type: 'int',
      default: 30,
    },
  ],
  columns: ['number', 'title', 'user', 'state', 'comments', 'created_at', 'updated_at'],
  func: async (_page, kwargs) => {
    const res = await fetch(
      `https://api.github.com/repos/${kwargs.repo}/issues?state=${kwargs.state}&per_page=${kwargs.limit}`
    );
    const data = await res.json();

    if ((data as any).message === 'Not Found') {
      throw new Error(`Repository not found: ${kwargs.repo}`);
    }

    return (data as any[])
      .filter((item: any) => !item.pull_request) // 过滤掉 PR
      .slice(0, kwargs.limit)
      .map((item: any) => ({
        number: item.number || 0,
        title: item.title || '',
        user: item.user?.login || '',
        state: item.state || '',
        comments: item.comments || 0,
        created_at: item.created_at || '',
        updated_at: item.updated_at || '',
      }));
  },
});