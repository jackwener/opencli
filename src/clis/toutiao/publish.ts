/**
 * Toutiao publish — UI automation for publishing an article in Toutiao creator center.
 *
 * Requires: logged into mp.toutiao.com in Chrome (Browser Bridge).
 *
 * Usage:
 *   opencli toutiao publish --title "标题" "正文内容"
 *   opencli toutiao publish --draft --title "标题" "正文内容"
 */

import { cli, Strategy } from '../../registry.js';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '../../errors.js';
import type { IPage } from '../../types.js';

// The creator center is hosted on mp.toutiao.com. The exact publish path can change,
// so we try a few known candidates before falling back to the homepage.
const PUBLISH_URL_CANDIDATES = [
  'https://mp.toutiao.com/profile_v4/graphic/publish',
  'https://mp.toutiao.com/profile_v4/graphic/publish?from=menu',
  'https://mp.toutiao.com/',
];

const TITLE_SELECTORS = [
  '[contenteditable="true"][placeholder*="标题"]',
  'input[placeholder*="标题"]',
  'input[placeholder*="请输入标题"]',
  'input[name*="title" i]',
  'textarea[placeholder*="标题"]',
  'input',
];

const BODY_SELECTORS = [
  '[contenteditable="true"][placeholder*="正文"]',
  '[contenteditable="true"][data-placeholder*="正文"]',
  'textarea[placeholder*="正文"]',
  'textarea',
  '[contenteditable="true"]',
];

async function ensureSimplePublishOptions(page: IPage): Promise<void> {
  // Best-effort: make it "as simple as possible" per user request:
  // 1) 无封面 2) 不添加位置 3) 不投放广告
  // This is intentionally tolerant — if any option is not found, we continue.
  await page.evaluate(`
    (() => {
      const norm = (s) => String(s || '').replace(/\\s+/g, '');
      const clickByText = (texts) => {
        const nodes = Array.from(document.querySelectorAll('label, button, a, [role="button"], [role="radio"], [role="menuitem"]'));
        for (const t of texts) {
          const needle = norm(t);
          const hit = nodes.find(el => norm(el.innerText || '').includes(needle));
          if (hit) {
            try { hit.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {}
            try { hit.click(); } catch {}
            return true;
          }
        }
        return false;
      };

      // 无封面（封面区域通常有“单图/三图/无封面”）
      clickByText(['无封面']);

      // 不投放广告
      clickByText(['不投放广告']);

      // 不添加位置：尽量清空“标记城市”输入；有 clear 按钮就点
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      const loc = inputs.find(el => norm(el.getAttribute('placeholder') || '').includes('标记城市'));
      if (loc) {
        try { loc.focus(); } catch {}
        try { loc.value = ''; loc.dispatchEvent(new Event('input', { bubbles: true })); loc.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
        // try click clear icon in same field container
        const parent = loc.closest('div') || loc.parentElement;
        if (parent) {
          const clears = Array.from(parent.querySelectorAll('button, span, i, svg, [role="button"]'));
          const clearBtn = clears.find(el => /清除|删除|×|x/i.test((el.innerText || el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '')));
          if (clearBtn) {
            try { clearBtn.click(); } catch {}
          }
        }
      }
    })()
  `);
}

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
      // Common mp.toutiao.com auth buttons
      const btn = Array.from(document.querySelectorAll('button,a')).find((el) => /登录|登陆/.test((el && el.innerText) || ''));
      return !!btn;
    })()
  `));
}

async function fillField(page: IPage, selectors: string[], text: string, fieldName: string): Promise<void> {
  if (!text || !text.trim()) throw new ArgumentError(`${fieldName} cannot be empty`);
  const payload = JSON.stringify({ selectors, text });
  const ok: boolean = await page.evaluate(`
    (() => {
      const { selectors, text } = ${payload};
      const isVisible = (el) => {
        try {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (!style) return true;
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
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
          try { el && el.focus && el.focus(); } catch {}
          // input / textarea
          const tag = (el && el.tagName) ? String(el.tagName).toUpperCase() : '';
          if (tag === 'INPUT' || tag === 'TEXTAREA') {
            el.value = '';
            document.execCommand?.('selectAll', false);
            document.execCommand?.('insertText', false, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          // contenteditable
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
  if (!ok) {
    throw new CommandExecutionError(`Could not find a ${fieldName} input on Toutiao publish page (UI may have changed)`);
  }
}

async function clickButtonByText(page: IPage, labels: string[], actionName: string): Promise<void> {
  const payload = JSON.stringify({ labels });
  const ok: boolean = await page.evaluate(`
    (() => {
      const { labels } = ${payload};
      const norm = (s) => String(s || '').replace(/\\s+/g, '');
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
      const isClickable = (el) => {
        if (!el) return false;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'button' || tag === 'a') return true;
        const role = (el.getAttribute && el.getAttribute('role')) || '';
        if (role === 'button' || role === 'menuitem') return true;
        const tabindex = el.getAttribute && el.getAttribute('tabindex');
        if (tabindex !== null && tabindex !== undefined && String(tabindex) !== '-1') return true;
        const onclick = (el.getAttribute && el.getAttribute('onclick')) || '';
        return !!onclick;
      };
      const findClickable = (el) => {
        let cur = el;
        for (let i = 0; i < 6 && cur; i++) {
          if (isClickable(cur) && isVisible(cur)) return cur;
          cur = cur.parentElement;
        }
        return null;
      };
      const candidates = Array.from(document.querySelectorAll('*'))
        .filter(isVisible)
        .filter(el => {
          const t = norm(el.innerText || '');
          if (!t) return false;
          return labels.some(label => t.includes(norm(label)));
        });
      for (const el of candidates) {
        const clickable = findClickable(el);
        if (!clickable) continue;
        try { clickable.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {}
        try { clickable.click(); } catch {}
        return true;
      }
      return false;
    })()
  `);
  if (!ok) {
    throw new CommandExecutionError(`Could not find "${actionName}" button on Toutiao publish page (UI may have changed)`);
  }
}

async function clickOptionalByText(page: IPage, labels: string[]): Promise<boolean> {
  try {
    await clickButtonByText(page, labels, 'optional');
    return true;
  } catch {
    return false;
  }
}

async function waitForAutoSaveDraft(page: IPage, timeoutMs = 12_000): Promise<boolean> {
  const payload = JSON.stringify({ timeoutMs });
  const ok: boolean = await page.evaluate(`
    (() => new Promise((resolve) => {
      const { timeoutMs } = ${payload};
      const deadline = Date.now() + timeoutMs;
      const has = () => {
        const text = (document.body && (document.body.innerText || '')) || '';
        // Seen on Toutiao publish page footer
        return /草稿将自动保存|已保存|保存成功|草稿已保存/.test(text);
      };
      const tick = () => {
        if (has()) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 300);
      };
      tick();
    }))()
  `);
  return ok;
}

async function waitForSuccessSignal(page: IPage, opts: { timeoutMs?: number; beforeHref?: string; mode: 'publish' | 'draft' }): Promise<{ ok: boolean; href?: string; signal?: string }> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const beforeHref = opts.beforeHref ?? '';
  const payload = JSON.stringify({ timeoutMs, beforeHref, mode: opts.mode });
  const result: { ok: boolean; href?: string; signal?: string; message?: string } = await page.evaluate(`
    (() => new Promise((resolve) => {
      const { timeoutMs, beforeHref, mode } = ${payload};
      const deadline = Date.now() + timeoutMs;
      const normalize = (s) => String(s || '').replace(/\\s+/g, '');
      const successRegex = mode === 'draft'
        ? /保存成功|已保存|已存草稿|草稿已保存/
        : /发布成功|已发布|提交成功|发布完成/;
      const errorRegex = /失败|出错|异常|请完善|必填|请选择|无法|未通过|提交失败|保存失败|请先|未填写|未选择/;
      const hasSuccessToast = () => {
        const text = (document.body && (document.body.innerText || '')) || '';
        return successRegex.test(text);
      };
      const readErrorText = () => {
        // Prefer toast / message containers if present, otherwise fall back to body text slice.
        const pick = (el) => normalize((el && (el.innerText || el.textContent)) || '');
        const nodes = Array.from(document.querySelectorAll(
          '[class*="toast" i], [class*="message" i], [class*="msg" i], [class*="error" i], [class*="warn" i], [class*="tip" i], [role="alert"], [role="alertdialog"], [aria-live]'
        ));
        for (const el of nodes) {
          const t = pick(el);
          if (t && errorRegex.test(t)) return t.slice(0, 200);
        }
        const body = normalize(((document.body && document.body.innerText) || ''));
        const idx = body.search(errorRegex);
        if (idx >= 0) return body.slice(Math.max(0, idx - 20), Math.min(body.length, idx + 120));
        return '';
      };
      const hrefChanged = () => {
        const cur = String(location.href || '');
        return !!beforeHref && cur && cur !== beforeHref;
      };
      const nowHref = () => String(location.href || '');
      const tick = () => {
        const errText = readErrorText();
        if (errText) return resolve({ ok: false, href: nowHref(), signal: 'error', message: errText });
        if (hasSuccessToast()) return resolve({ ok: true, href: nowHref(), signal: 'toast' });
        if (hrefChanged()) return resolve({ ok: true, href: nowHref(), signal: 'href' });
        if (Date.now() > deadline) return resolve({ ok: false, href: nowHref(), signal: 'timeout' });
        setTimeout(tick, 300);
      };
      tick();
    }))()
  `);
  return result;
}

async function gotoPublish(page: IPage): Promise<void> {
  for (const url of PUBLISH_URL_CANDIDATES) {
    try {
      await page.goto(url, { waitUntil: 'load' });
      // Give the SPA time to hydrate and render editors.
      await page.wait(3);
      return;
    } catch {
      // try next
    }
  }
  // As a last resort, rely on the browser bridge to navigate errors upstream.
  await page.goto('https://mp.toutiao.com/', { waitUntil: 'load' });
  await page.wait(2);
}

async function ensureCategory(page: IPage, category: string | undefined): Promise<void> {
  const cat = String(category ?? '').trim();
  const payload = JSON.stringify({ category: cat });
  const res: { ok: boolean; changed?: boolean; message?: string } = await page.evaluate(`
    (() => {
      const { category } = ${payload};
      const norm = (s) => String(s || '').replace(/\\s+/g, '');
      const findClickable = (el) => {
        let cur = el;
        for (let i = 0; i < 6 && cur; i++) {
          const tag = (cur.tagName || '').toLowerCase();
          const role = (cur.getAttribute && cur.getAttribute('role')) || '';
          const clickable = tag === 'button' || tag === 'a' || role === 'button' || role === 'combobox' || role === 'menuitem';
          if (clickable) return cur;
          cur = cur.parentElement;
        }
        return null;
      };
      const bodyText = norm((document.body && document.body.innerText) || '');
      if (!bodyText.includes('分类')) return { ok: true, changed: false };

      // If category already appears near "分类", assume selected.
      // (Heuristic: if the page contains "分类" and also contains the selected category text)
      if (category && bodyText.includes(norm(category))) return { ok: true, changed: false };

      // Click the category dropdown: search elements whose innerText contains 分类.
      const nodes = Array.from(document.querySelectorAll('*')).filter(el => norm(el.innerText || '').includes('分类'));
      let clicked = false;
      for (const n of nodes.slice(0, 20)) {
        const c = findClickable(n) || findClickable(n.parentElement);
        if (c && c.click) {
          try { c.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {}
          try { c.click(); } catch {}
          clicked = true;
          break;
        }
      }
      if (!clicked) return { ok: true, changed: false };

      // After dropdown opens, choose category if provided, else pick first option.
      const optionCandidates = () => Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li, div'))
        .filter(el => {
          const t = norm(el.innerText || '');
          if (!t) return false;
          // avoid huge containers; options are usually short
          if (t.length > 30) return false;
          // filter out label itself
          if (t === '分类') return false;
          return true;
        });

      const opts = optionCandidates();
      if (!opts.length) return { ok: true, changed: false, message: 'no options found' };

      const target = category
        ? (opts.find(el => norm(el.innerText || '').includes(norm(category))) || null)
        : opts[0];
      if (!target || !target.click) return { ok: true, changed: false, message: 'no clickable option' };
      try { target.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {}
      try { target.click(); } catch {}
      return { ok: true, changed: true };
    })()
  `);
  if (!res.ok) {
    throw new CommandExecutionError(`Failed to set Toutiao category: ${res.message ?? 'unknown'}`);
  }
}

async function waitForEditor(page: IPage, timeoutMs = 15_000): Promise<void> {
  const selectors = [...new Set([...TITLE_SELECTORS, ...BODY_SELECTORS])]
    .filter(Boolean)
    .slice(0, 12)
    .join(',');
  try {
    await page.wait({ selector: selectors, timeout: timeoutMs });
  } catch {
    const href: string = await page.evaluate(`(() => String(location.href || ''))()`);
    throw new CommandExecutionError(`Toutiao editor did not appear within ${(timeoutMs / 1000).toFixed(0)}s (href=${href})`);
  }
}

cli({
  site: 'toutiao',
  name: 'publish',
  description: '在今日头条创作者中心发布文章（UI 自动化，复用 Chrome 登录态）',
  domain: 'mp.toutiao.com',
  strategy: Strategy.UI,
  navigateBefore: false,
  args: [
    { name: 'title', required: true, help: '文章标题' },
    { name: 'body', required: true, positional: true, help: '正文内容（纯文本，支持换行）' },
    { name: 'draft', type: 'bool', default: false, help: '保存草稿（不发布）' },
    { name: 'publish', type: 'bool', default: false, help: '显式发布（默认即发布）' },
    { name: 'category', help: '文章分类（不填则尝试自动选择）' },
  ],
  func: async (page: IPage | undefined, kwargs) => {
    if (!page) throw new CommandExecutionError('Browser session required for toutiao publish');

    const title = String(kwargs.title ?? '').trim();
    const body = String(kwargs.body ?? '').trim();
    if (!title) throw new ArgumentError('Missing --title');
    if (!body) throw new ArgumentError('Missing body text');

    const draft = normalizeBool(kwargs.draft);
    const publish = normalizeBool(kwargs.publish);
    const mode: 'draft' | 'publish' = draft && !publish ? 'draft' : 'publish';

    await gotoPublish(page);
    if (await looksLikeLoginRequired(page)) {
      throw new AuthRequiredError(
        'toutiao.com',
        '请先在 Chrome 登录头条号/创作者中心（mp.toutiao.com），再重试该命令。',
      );
    }

    await waitForEditor(page, 20_000);

    const beforeHref: string = await page.evaluate(`(() => String(location.href || ''))()`);

    // Some Toutiao flows require selecting a category before saving/publishing.
    await ensureCategory(page, kwargs.category);

    await fillField(page, TITLE_SELECTORS, title, 'title');
    await fillField(page, BODY_SELECTORS, body, 'body');

    // Simplify publish options (no cover, no location, no ads) per user request.
    await ensureSimplePublishOptions(page);

    if (mode === 'draft') {
      // Toutiao often auto-saves drafts; there may be no explicit "save draft" button.
      const clicked = await clickOptionalByText(page, ['存草稿', '保存草稿', '存入草稿箱', '保存']);
      if (!clicked) {
        await clickOptionalByText(page, ['更多', '⋯', '...', 'More']);
        await clickOptionalByText(page, ['存草稿', '保存草稿', '存入草稿箱', '保存']);
      }
      const saved = await waitForAutoSaveDraft(page, 12_000);
      if (!saved) {
        throw new CommandExecutionError('Draft may not have been saved (no autosave signal detected). 请检查页面底部是否提示“草稿将自动保存/已保存”。');
      }
    } else {
      // Current UI shows "预览并发布" (screenshot). Prefer that over generic "发布".
      await clickButtonByText(page, ['预览并发布', '预览发布', '发布', '发表', '提交'], 'publish');
    }

    // Some Toutiao flows show a confirmation modal (e.g. "确认发布") or extra step.
    // Try to confirm once if a modal appears, then re-wait for success.
    let sig = await waitForSuccessSignal(page, { mode, beforeHref, timeoutMs: 25_000 });
    if (!sig.ok && mode === 'publish') {
      const clickedConfirm = await clickOptionalByText(page, ['确认发布', '确认', '确定', '继续发布', '发布']);
      if (clickedConfirm) {
        sig = await waitForSuccessSignal(page, { mode, beforeHref, timeoutMs: 25_000 });
      }
    }
    if (!sig.ok) {
      const extra = (sig as any).message ? `\n页面提示：${(sig as any).message}` : '';
      throw new CommandExecutionError(
        `Clicked "${mode}" but could not confirm success within 25s (signal=${sig.signal}, href=${sig.href ?? ''}). ` +
        '可能是页面需要二次确认/选择发布设置/风控弹窗。建议加 -v 查看，或传 --category 指定分类。' +
        extra,
      );
    }

    return {
      ok: true,
      mode,
      title,
      url: sig.href ?? '',
      id: '',
    };
  },
});

