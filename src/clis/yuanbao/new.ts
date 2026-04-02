import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';
import { AuthRequiredError } from '../../errors.js';

const YUANBAO_DOMAIN = 'yuanbao.tencent.com';
const YUANBAO_URL = 'https://yuanbao.tencent.com/';

async function isOnYuanbao(page: IPage): Promise<boolean> {
  const url = await page.evaluate('window.location.href').catch(() => '');
  if (typeof url !== 'string' || !url) return false;

  try {
    const hostname = new URL(url).hostname;
    return hostname === YUANBAO_DOMAIN || hostname.endsWith(`.${YUANBAO_DOMAIN}`);
  } catch {
    return false;
  }
}

async function ensureYuanbaoPage(page: IPage): Promise<void> {
  if (!(await isOnYuanbao(page))) {
    await page.goto(YUANBAO_URL, { waitUntil: 'load', settleMs: 2500 });
    await page.wait(1);
  }
}

async function hasLoginGate(page: IPage): Promise<boolean> {
  const result = await page.evaluate(`(() => {
    const bodyText = document.body.innerText || '';
    const hasWechatLoginText = bodyText.includes('微信扫码登录');
    const hasWechatIframe = Array.from(document.querySelectorAll('iframe'))
      .some((frame) => (frame.getAttribute('src') || '').includes('open.weixin.qq.com/connect/qrconnect'));

    return hasWechatLoginText || hasWechatIframe;
  })()`);

  return Boolean(result);
}

async function getCurrentUrl(page: IPage): Promise<string> {
  const result = await page.evaluate('window.location.href').catch(() => '');
  return typeof result === 'string' ? result : '';
}

async function getComposerText(page: IPage): Promise<string> {
  const result = await page.evaluate(`(() => {
    const composer = document.querySelector('.ql-editor, [contenteditable="true"]');
    return composer ? (composer.textContent || '').trim() : '';
  })()`);

  return typeof result === 'string' ? result.trim() : '';
}

async function startNewYuanbaoChat(page: IPage): Promise<'clicked' | 'navigate' | 'blocked'> {
  await ensureYuanbaoPage(page);

  if (await hasLoginGate(page)) return 'blocked';

  const beforeUrl = await getCurrentUrl(page);
  const action = await page.evaluate(`(() => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    };

    const trigger = Array.from(document.querySelectorAll('.yb-common-nav__trigger[data-desc="new-chat"]'))
      .find((node) => isVisible(node));

    if (trigger instanceof HTMLElement) {
      trigger.click();
      return 'clicked';
    }

    return 'navigate';
  })()`) as 'clicked' | 'navigate';

  if (action === 'navigate') {
    await page.goto(YUANBAO_URL, { waitUntil: 'load', settleMs: 2500 });
    await page.wait(1);
    if (await hasLoginGate(page)) return 'blocked';
    return 'navigate';
  }

  await page.wait(1);

  if (await hasLoginGate(page)) return 'blocked';

  const afterUrl = await getCurrentUrl(page);
  const composerText = await getComposerText(page);
  if (afterUrl !== beforeUrl || !composerText) return 'clicked';

  await page.goto(YUANBAO_URL, { waitUntil: 'load', settleMs: 2500 });
  await page.wait(1);
  return 'navigate';
}

export const newCommand = cli({
  site: 'yuanbao',
  name: 'new',
  description: 'Start a new conversation in Yuanbao web chat',
  domain: YUANBAO_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: ['Status', 'Action'],
  func: async (page: IPage) => {
    const action = await startNewYuanbaoChat(page);

    if (action === 'blocked') {
      throw new AuthRequiredError(
        YUANBAO_DOMAIN,
        'Yuanbao opened a login gate instead of starting a new chat. Likely login/auth/challenge/session issue in the existing yuanbao.tencent.com browser session.',
      );
    }

    return [{
      Status: 'Success',
      Action: action === 'navigate' ? 'Reloaded Yuanbao homepage as fallback' : 'Clicked New chat',
    }];
  },
});
