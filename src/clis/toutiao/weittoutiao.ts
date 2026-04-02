/**
 * Toutiao 微头条发布 — UI automation for posting a micro post (weitoutiao).
 *
 * Requires: logged into mp.toutiao.com in Chrome (Browser Bridge).
 *
 * Usage:
 *   opencli toutiao weitoutiao "内容"
 *   opencli toutiao weitoutiao --draft "内容"
 *
 * （命令名也支持别名 weittoutiao，与旧拼写兼容）
 */

import { cli, Strategy } from '../../registry.js';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '../../errors.js';
import type { IPage } from '../../types.js';

const MP_HOME = 'https://mp.toutiao.com/';
/** 微头条官方路径为 weitoutiao（单 t），非 weittoutiao */
const WEITOUTIAO_PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/weitoutiao/publish';
const WEITOUTIAO_PUBLISH_URL_WITH_QUERY = 'https://mp.toutiao.com/profile_v4/weitoutiao/publish?from=toutiao_pc';

function isWeitoutiaoPublishHref(href: string): boolean {
  const u = (href || '').toLowerCase();
  if (!u.includes('mp.toutiao.com')) return false;
  return u.includes('/weitoutiao/publish') || u.includes('/weittoutiao/publish');
}

const TEXT_SELECTORS = [
  '[contenteditable="true"][placeholder*="新鲜事"]',
  '[contenteditable="true"][data-placeholder*="新鲜事"]',
  '[contenteditable="true"]',
  'textarea[placeholder*="新鲜事"]',
  'textarea',
];

function normalizeBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'y', 'on'].includes(v.toLowerCase().trim());
  return false;
}

async function looksLikeLoginRequired(page: IPage): Promise<boolean> {
  return Boolean(await page.evaluate(`
    (() => {
      const href = String(location.href || '');
      if (/login/i.test(href)) return true;
      const text = (document.body && (document.body.innerText || '')) || '';
      if (/登录|登陆|手机号登录|验证码登录|注册/.test(text)) return true;
      if (document.querySelector('input[type="password"]')) return true;
      const btn = Array.from(document.querySelectorAll('button,a')).find((el) => /登录|登陆/.test((el && el.innerText) || ''));
      return !!btn;
    })()
  `));
}

async function waitForEditor(page: IPage, timeoutMs = 15_000): Promise<void> {
  const sel = TEXT_SELECTORS.slice(0, 4).join(',');
  try {
    await page.wait({ selector: sel, timeout: timeoutMs });
  } catch {
    const href: string = await page.evaluate(`(() => String(location.href || ''))()`);
    throw new CommandExecutionError(`Weitoutiao editor did not appear within ${(timeoutMs / 1000).toFixed(0)}s (href=${href})`);
  }
}

async function pageLooksLikeWeittoutiaoBlank(page: IPage): Promise<boolean> {
  return Boolean(await page.evaluate(`
    (() => {
      const href = String(location.href || '');
      if (!href.includes('mp.toutiao.com') || (!href.includes('/weitoutiao/publish') && !href.includes('/weittoutiao/publish'))) return false;
      const t = (document.body && (document.body.innerText || '')) || '';
      const hasEditor = !!(document.querySelector('[contenteditable="true"]') || document.querySelector('textarea'));
      const hasHint = /新鲜事|发布微头条|头条号/.test(t);
      return t.replace(/\\s+/g, '').length < 15 && !hasEditor && !hasHint;
    })()
  `));
}

async function ensureOnWeittoutiaoTab(page: IPage): Promise<void> {
  const currentHref = await page.evaluate(`(() => String(location.href || ''))()`).catch(() => '');

  // Prefer reusing an existing Toutiao tab instead of relying on a newly created blank tab.
  try {
    const rawTabs = await page.tabs().catch(() => []);
    if (Array.isArray(rawTabs) && rawTabs.length > 0) {
      const tabs = rawTabs.map((t: any, index: number) => ({
        index: typeof t?.index === 'number' ? t.index : index,
        url: String(t?.url || ''),
        title: String(t?.title || ''),
        active: t?.active === true,
      }));
      const pick = (tab: { url: string; title: string; active: boolean }) => {
        const url = (tab.url || '').toLowerCase();
        const title = (tab.title || '').toLowerCase();
        const hay = `${title} ${url}`;
        let score = 0;
        if (hay.includes('mp.toutiao.com') && (hay.includes('/weitoutiao/publish') || hay.includes('/weittoutiao/publish'))) score += 1000;
        else if (hay.includes('mp.toutiao.com')) score += 200;
        if (tab.active) score += 25;
        if (url.startsWith('http')) score += 10;
        if (url.startsWith('data:') || url.startsWith('chrome:') || url.startsWith('chrome-extension:')) score -= 500;
        return score;
      };
      const best = [...tabs].sort((a, b) => pick(b as any) - pick(a as any))[0];
      if (best && pick(best as any) > 0) {
        await page.selectTab(best.index);
        await page.wait(0.8);
      }
    }
  } catch {}

  async function goPublish(url: string): Promise<void> {
    await page.goto(url, { waitUntil: 'load', settleMs: 4500 });
    await page.wait(2);
  }

  // 1) Many users see a white screen when opening publish in a cold tab.
  //    Bootstrap session via mp home first (cookie + SPA shell).
  await page.goto(MP_HOME, { waitUntil: 'load', settleMs: 4500 });
  await page.wait(2);

  if (await looksLikeLoginRequired(page)) {
    throw new AuthRequiredError(
      'toutiao.com',
      '请先在同一浏览器完成头条号登录（打开 ' + MP_HOME + ' 能正常看到后台），再运行本命令。',
    );
  }

  // 2) Prefer the PC entry you confirmed works: ?from=toutiao_pc
  await goPublish(WEITOUTIAO_PUBLISH_URL_WITH_QUERY);
  let href: string = await page.evaluate(`(() => String(location.href || ''))()`).catch(() => '');
  if (isWeitoutiaoPublishHref(href) && !(await pageLooksLikeWeittoutiaoBlank(page))) {
    return;
  }

  // 3) Fallback: path without query
  await goPublish(WEITOUTIAO_PUBLISH_URL);
  href = await page.evaluate(`(() => String(location.href || ''))()`).catch(() => '');
  if (isWeitoutiaoPublishHref(href) && !(await pageLooksLikeWeittoutiaoBlank(page))) {
    return;
  }

  // 4) Still blank on correct path → give actionable hint (network / 拦截 / 需从菜单进入)
  if (await pageLooksLikeWeittoutiaoBlank(page)) {
    throw new CommandExecutionError(
      '微头条发布页已打开但内容为空白（常见原因：未登录、网络或广告拦截、企业网关拦截 mp.toutiao.com JS）。' +
        '请用同一 Chrome 窗口：先打开 ' +
        MP_HOME +
        ' 确认后台正常加载，再从左侧菜单进入「发布」→「微头条」；' +
        '若手动进入也白屏，请先排除拦截/换网络后再用 opencli。',
    );
  }

  if (href.startsWith('data:text/html') || href === 'about:blank' || currentHref.startsWith('data:text/html')) {
    throw new CommandExecutionError(
      `Could not navigate to weitoutiao publish page (current href=${href || currentHref}). ` +
        '请确保 Browser Bridge 连在普通网页标签上，而不是空白 data: 页。',
    );
  }
}

async function fillText(page: IPage, text: string): Promise<void> {
  if (!text || !text.trim()) throw new ArgumentError('Content cannot be empty');
  const payload = JSON.stringify({ selectors: TEXT_SELECTORS, text });
  const ok: boolean = await page.evaluate(`
    (() => {
      const { selectors, text } = ${payload};
      const isVisible = (el) => {
        try {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
          const rect = el.getBoundingClientRect?.();
          if (rect && (rect.width === 0 || rect.height === 0)) return false;
          return true;
        } catch { return false; }
      };
      for (const sel of selectors) {
        let nodes = [];
        try { nodes = Array.from(document.querySelectorAll(sel)); } catch { nodes = []; }
        for (const el of nodes) {
          if (!isVisible(el)) continue;
          try { el.focus && el.focus(); } catch {}
          const tag = (el && el.tagName) ? String(el.tagName).toUpperCase() : '';
          if (tag === 'TEXTAREA' || tag === 'INPUT') {
            el.value = '';
            document.execCommand?.('selectAll', false);
            document.execCommand?.('insertText', false, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          if (el && (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true'))) {
            el.textContent = '';
            document.execCommand?.('selectAll', false);
            document.execCommand?.('insertText', false, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    })()
  `);
  if (!ok) throw new CommandExecutionError('Could not find weitoutiao text editor (UI may have changed)');
}

async function clearLocationIfAny(page: IPage): Promise<void> {
  await page.evaluate(`
    (() => {
      const norm = (s) => String(s || '').replace(/\\s+/g, '');
      const inputs = Array.from(document.querySelectorAll('input'));
      const loc = inputs.find(el => norm(el.getAttribute('placeholder') || '').includes('标记位置'));
      if (!loc) return;
      try { loc.focus(); } catch {}
      try {
        loc.value = '';
        loc.dispatchEvent(new Event('input', { bubbles: true }));
        loc.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    })()
  `);
}

async function clickByText(page: IPage, labels: string[], actionName: string): Promise<void> {
  const payload = JSON.stringify({ labels });
  const ok: boolean = await page.evaluate(`
    (() => {
      const { labels } = ${payload};
      const norm = (s) => String(s || '').replace(/\\s+/g, '');
      const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"]'));
      for (const label of labels) {
        const needle = norm(label);
        const target = nodes.find(el => norm(el.innerText || '').includes(needle));
        if (target) {
          try { target.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {}
          try { target.click(); } catch {}
          return true;
        }
      }
      return false;
    })()
  `);
  if (!ok) throw new CommandExecutionError(`Could not find "${actionName}" button on weitoutiao publish page`);
}

async function waitForSuccessOrError(page: IPage, opts: { timeoutMs?: number; beforeHref?: string; mode: 'publish' | 'draft' }): Promise<{ ok: boolean; href?: string; signal?: string; message?: string }> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const beforeHref = opts.beforeHref ?? '';
  const payload = JSON.stringify({ timeoutMs, beforeHref, mode: opts.mode });
  return await page.evaluate(`
    (() => new Promise((resolve) => {
      const { timeoutMs, beforeHref, mode } = ${payload};
      const deadline = Date.now() + timeoutMs;
      const successRegex = mode === 'draft'
        ? /保存成功|已保存|草稿已保存|存草稿成功/
        : /发布成功|已发布|提交成功|发布完成/;
      const errorRegex = /失败|出错|异常|请完善|必填|请选择|无法|未通过|提交失败|保存失败|请先/;
      const normalize = (s) => String(s || '').replace(/\\s+/g, '');
      const nowHref = () => String(location.href || '');
      const hrefChanged = () => !!beforeHref && nowHref() && nowHref() !== beforeHref;
      const readMsg = () => {
        const pick = (el) => normalize((el && (el.innerText || el.textContent)) || '');
        const nodes = Array.from(document.querySelectorAll('[class*="toast" i], [class*="message" i], [class*="msg" i], [class*="error" i], [class*="warn" i], [role="alert"], [role="alertdialog"], [aria-live]'));
        for (const el of nodes) {
          const t = pick(el);
          if (t && (successRegex.test(t) || errorRegex.test(t))) return t.slice(0, 200);
        }
        const body = normalize(((document.body && document.body.innerText) || ''));
        const m = body.match(successRegex) || body.match(errorRegex);
        if (m) return m[0];
        return '';
      };
      const tick = () => {
        const msg = readMsg();
        if (msg && errorRegex.test(msg)) return resolve({ ok: false, href: nowHref(), signal: 'error', message: msg });
        if (msg && successRegex.test(msg)) return resolve({ ok: true, href: nowHref(), signal: 'toast', message: msg });
        if (hrefChanged()) return resolve({ ok: true, href: nowHref(), signal: 'href' });
        if (Date.now() > deadline) return resolve({ ok: false, href: nowHref(), signal: 'timeout' });
        setTimeout(tick, 300);
      };
      tick();
    }))()
  `);
}

cli({
  site: 'toutiao',
  name: 'weitoutiao',
  aliases: ['weittoutiao'],
  description: '发布微头条（UI 自动化，复用 Chrome 登录态）',
  domain: 'mp.toutiao.com',
  strategy: Strategy.UI,
  navigateBefore: false,
  timeoutSeconds: 90,
  args: [
    { name: 'text', required: true, positional: true, help: '微头条内容' },
    { name: 'draft', type: 'bool', default: false, help: '存草稿（不发布）' },
    { name: 'publish', type: 'bool', default: false, help: '显式发布（默认即发布）' },
  ],
  func: async (page: IPage | undefined, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for toutiao weitoutiao');

    const text = String(kwargs.text ?? '').trim();
    if (!text) throw new ArgumentError('Missing micro post text');

    const draft = normalizeBool(kwargs.draft);
    const publish = normalizeBool(kwargs.publish);
    const mode: 'draft' | 'publish' = draft && !publish ? 'draft' : 'publish';

    await ensureOnWeittoutiaoTab(page);
    if (await looksLikeLoginRequired(page)) {
      throw new AuthRequiredError('toutiao.com', '请先在 Chrome 登录头条号/创作者中心（mp.toutiao.com），再重试该命令。');
    }

    await waitForEditor(page, 30_000);

    // Simplest options: do not add location.
    await clearLocationIfAny(page);

    const beforeHref: string = await page.evaluate(`(() => String(location.href || ''))()`);

    await fillText(page, text);

    if (mode === 'draft') {
      await clickByText(page, ['存草稿', '保存草稿', '存草稿箱'], 'save draft');
    } else {
      await clickByText(page, ['发布'], 'publish');
    }

    const sig = await waitForSuccessOrError(page, { mode, beforeHref, timeoutMs: 25_000 });
    if (!sig.ok) {
      const extra = sig.message ? `\n页面提示：${sig.message}` : '';
      throw new CommandExecutionError(
        `Weitoutiao ${mode} did not confirm success within 25s (signal=${sig.signal}, href=${sig.href ?? ''}).` + extra,
      );
    }

    return {
      ok: true,
      mode,
      url: sig.href ?? '',
    };
  },
});

