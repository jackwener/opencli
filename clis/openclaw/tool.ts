/**
 * 文档语言和 URL 工具模块
 *
 * 供 list.ts 和 read.ts 调用
 */

export interface Language {
  code: string;
  name: string;
  url: string;
}

// 语言列表（映射表）
const LANGS: Language[] = [
  { code: 'en', name: 'English', url: 'https://docs.openclaw.ai' },
  { code: 'zh-CN', name: '简体中文', url: 'https://docs.openclaw.ai/zh-CN' }
];

/**
 * 获取支持的语言代码列表
 */
export function getSupportedLangCodes(): string[] {
  return LANGS.map(l => l.code);
}

/**
 * 获取默认语言代码
 */
export function getDefaultLang(): string {
  return 'en';
}

/**
 * 根据语言代码获取基础 URL
 *
 * @param lang - 语言代码（如 'en', 'zh-CN', 'cn', 'zh', 'ja-JP'）
 * @returns 对应的基础 URL，默认返回英文
 */
export async function getBaseUrl(lang?: string): Promise<string> {
  const code = lang || 'en';
  const codeLower = code.toLowerCase();

  // 精确匹配
  const exact = LANGS.find(l => l.code.toLowerCase() === codeLower);
  if (exact) return exact.url;

  // 模糊匹配：用户输入可能是完整形式（如 ja-JP, zh-CN）或部分形式（如 cn, zh, ja）
  // 先尝试前缀匹配（用户输入是完整形式，LANGS 是短形式）
  let fuzzy = LANGS.find(l => codeLower.startsWith(l.code.toLowerCase() + '-') || codeLower.startsWith(l.code.toLowerCase() + '_'));
  // 再尝试包含匹配（用户输入是短形式，LANGS 是完整形式，如 cn→zh-CN）
  if (!fuzzy) fuzzy = LANGS.find(l => l.code.toLowerCase().includes(codeLower));
  if (fuzzy) {
    // 模糊匹配到，先尝试用户输入的直接 URL（可能更准确），再试 LANGS URL
    const directUrl = code === 'en' ? 'https://docs.openclaw.ai' : `https://docs.openclaw.ai/${code}`;
    if (await urlExists(directUrl)) return directUrl;
    if (await urlExists(fuzzy.url)) return fuzzy.url;
    return 'https://docs.openclaw.ai';
  }

  // 没有匹配到，尝试直接用原始 code 构建 URL
  const directUrl = code === 'en' ? 'https://docs.openclaw.ai' : `https://docs.openclaw.ai/${code}`;
  if (await urlExists(directUrl)) return directUrl;

  // 回退到英文
  return 'https://docs.openclaw.ai';
}

/**
 * 从 baseUrl 提取 origin（域名部分），去除语言前缀
 *
 * @param baseUrl - 带语言前缀的 URL，如 https://docs.openclaw.ai/zh-CN
 * @returns 纯域名，如 https://docs.openclaw.ai
 */
export function getOrigin(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

/**
 * 从路径构建完整文档 URL
 *
 * @param baseUrl - 带语言前缀的 base URL
 * @param path - 文档路径（可能已包含语言前缀）
 * @returns 完整的文档 URL
 */
export function buildDocUrl(baseUrl: string, path: string): string {
  // 如果 path 已是完整 URL，直接返回
  if (path.startsWith('http')) return path;

  const origin = getOrigin(baseUrl);

  // path 已包含语言前缀（如 /zh-CN/channels），直接拼接 origin
  if (path.startsWith('/')) {
    return origin + path;
  }

  // 相对路径，拼接到 baseUrl
  return baseUrl + '/' + path;
}

/**
 * 清理标题，移除特殊字符
 *
 * @param title - 原始标题
 * @returns 安全的标题（用于文件名）
 */
export function safeTitle(title: string): string {
  return title.replace(/[^\w\u4e00-\u9fff-]/g, '_').substring(0, 80);
}

/**
 * 修复 Windows 路径问题
 *
 * 将 /D:/xxx 格式修正为 /xxx
 *
 * @param path - 路径
 * @returns 修正后的路径
 */
export function fixWindowsPath(path: string): string {
  const windowsPathMatch = path.match(/^\/([A-Za-z]):\/(.*)/);
  if (windowsPathMatch) {
    return '/' + windowsPathMatch[2];
  }
  return path;
}

/**
 * 检查 URL 是否存在
 */
async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    return res.ok || res.status === 301 || res.status === 302;
  } catch {
    return false;
  }
}

/**
 * 获取语言列表
 */
export function getLanguages(): Language[] {
  return LANGS;
}

/**
 * 从文档首页提取可用语言列表（保留接口，内部使用 LANGS）
 *
 * @deprecated 使用 getLanguages() 代替
 */
export async function getAvailableLanguages(): Promise<Language[]> {
  return LANGS;
}