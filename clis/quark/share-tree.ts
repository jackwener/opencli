import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import {
  extractPwdId,
  formatDate,
  getShareList,
  getToken,
} from './utils.js';

interface QuarkTreeNode {
  fid: string;
  name: string;
  size: number;
  is_dir: boolean;
  created_at: string;
  updated_at: string;
  children?: QuarkTreeNode[];
}

async function buildTree(
  page: IPage,
  pwdId: string,
  stoken: string,
  pdirFid: string,
  depth: number,
  maxDepth: number,
): Promise<QuarkTreeNode[]> {
  if (depth > maxDepth) return [];

  const files = await getShareList(page, pwdId, stoken, pdirFid, { sort: 'file_type:asc,file_name:asc' });
  const nodes: QuarkTreeNode[] = [];

  for (const file of files) {
    const node: QuarkTreeNode = {
      fid: file.fid,
      name: file.file_name,
      size: file.size,
      is_dir: file.dir,
      created_at: formatDate(file.created_at),
      updated_at: formatDate(file.updated_at),
    };

    if (file.dir && depth < maxDepth) {
      node.children = await buildTree(page, pwdId, stoken, file.fid, depth + 1, maxDepth);
    }

    nodes.push(node);
  }

  return nodes;
}

cli({
  site: 'quark',
  name: 'share-tree',
  description: 'Get directory tree from Quark Drive share link as nested JSON',
  domain: 'pan.quark.cn',
  strategy: Strategy.COOKIE,
  defaultFormat: 'json',
  args: [
    { name: 'url', required: true, positional: true, help: 'Quark share URL or pwd_id' },
    { name: 'passcode', default: '', help: 'Share passcode (if required)' },
    { name: 'depth', type: 'int', default: 10, help: 'Max directory depth' },
  ],
  func: async (page: IPage, kwargs: Record<string, unknown>) => {
    const url = kwargs.url as string;
    const passcode = (kwargs.passcode as string) || '';
    const depth = (kwargs.depth as number) ?? 10;

    const pwdId = extractPwdId(url);
    const stoken = await getToken(page, pwdId, passcode);
    const tree = await buildTree(page, pwdId, stoken, '0', 0, depth);

    return { pwd_id: pwdId, stoken, tree };
  },
});
