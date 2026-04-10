import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';

cli({
  site: 'github',
  name: 'repo',
  description: 'GitHub 仓库详情',
  domain: 'github.com',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'input',
      type: 'str',
      required: true,
      positional: true,
      help: '仓库路径（如 jackwener/OpenCLI）或完整 URL',
    },
  ],
  columns: [
    'name',
    'description',
    'stars',
    'forks',
    'language',
    'license',
    'open_issues',
    'topics',
    'created_at',
    'updated_at',
  ],
  func: async (_page, kwargs) => {
    // 解析仓库路径
    let repoPath = kwargs.input;
    if (repoPath.startsWith('https://github.com/')) {
      repoPath = repoPath.replace('https://github.com/', '');
    }
    repoPath = repoPath.replace(/\/$/, '');

    const res = await fetch(`https://api.github.com/repos/${repoPath}`);
    const data = await res.json();

    if ((data as any).message === 'Not Found') {
      throw new Error(`Repository not found: ${repoPath}`);
    }

    return [
      {
        name: (data as any).name || '',
        description: (data as any).description || '',
        stars: (data as any).stargazers_count || 0,
        forks: (data as any).forks_count || 0,
        language: (data as any).language || '',
        license: (data as any).license?.spdx_id || '',
        open_issues: (data as any).open_issues_count || 0,
        topics: ((data as any).topics || []).join(', '),
        created_at: (data as any).created_at || '',
        updated_at: (data as any).updated_at || '',
      },
    ];
  },
});