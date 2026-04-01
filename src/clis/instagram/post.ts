import * as fs from 'node:fs';
import * as path from 'node:path';

import { cli, Strategy } from '../../registry.js';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '../../errors.js';
import type { IPage } from '../../types.js';

const INSTAGRAM_HOME_URL = 'https://www.instagram.com/';
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function buildEnsureComposerOpenJs(): string {
  return `
    (() => {
      const path = window.location?.pathname || '';
      const onLoginRoute = /\\/accounts\\/login\\/?/.test(path);
      const hasLoginField = !!document.querySelector('input[name="username"], input[name="password"]');
      const hasLoginButton = Array.from(document.querySelectorAll('button, div[role="button"]')).some((el) => {
        const text = (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        return text === 'log in' || text === 'login' || text === '登录';
      });

      if (onLoginRoute || (hasLoginField && hasLoginButton)) {
        return { ok: false, reason: 'auth' };
      }

      const alreadyOpen = document.querySelector('input[type="file"]');
      if (alreadyOpen) return { ok: true };

      const labels = ['Create', 'New post', 'Post', '创建', '新帖子'];
      const nodes = Array.from(document.querySelectorAll('a, button, div[role="button"], svg[aria-label], [aria-label]'));
      for (const node of nodes) {
        const text = ((node.textContent || '') + ' ' + (node.getAttribute?.('aria-label') || '')).trim();
        if (labels.some((label) => text.toLowerCase().includes(label.toLowerCase()))) {
          const clickable = node.closest('a, button, div[role="button"]') || node;
          if (clickable instanceof HTMLElement) {
            clickable.click();
            return { ok: true };
          }
        }
      }

      return { ok: true };
    })()
  `;
}

function requirePage(page: IPage | null): IPage {
  if (!page) throw new CommandExecutionError('Browser session required for instagram post');
  return page;
}

function validateImagePath(input: string): string {
  const resolved = path.resolve(String(input || '').trim());
  if (!resolved) {
    throw new ArgumentError('Argument "image" is required.', 'Provide --image /path/to/file.jpg');
  }
  if (!fs.existsSync(resolved)) {
    throw new ArgumentError(`Image file not found: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new ArgumentError(`Unsupported image format: ${ext}`, 'Supported formats: .jpg, .jpeg, .png, .webp');
  }

  return resolved;
}

async function ensureComposerOpen(page: IPage): Promise<void> {
  const result = await page.evaluate(buildEnsureComposerOpenJs()) as { ok?: boolean; reason?: string };

  if (!result?.ok) {
    if (result?.reason === 'auth') throw new AuthRequiredError('www.instagram.com', 'Instagram login required before posting');
    throw new CommandExecutionError('Failed to open Instagram post composer');
  }
}

async function dismissResidualDialogs(page: IPage): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await page.evaluate(`
      (() => {
        const isVisible = (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
        };

        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
          .filter((el) => el instanceof HTMLElement && isVisible(el));
        for (const dialog of dialogs) {
          const text = (dialog.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          if (!text) continue;
          if (
            text.includes('post shared')
            || text.includes('your post has been shared')
            || text.includes('something went wrong')
            || text.includes('sharing')
            || text.includes('create new post')
            || text.includes('crop')
            || text.includes('edit')
          ) {
            const close = dialog.querySelector('[aria-label="Close"], button[aria-label="Close"], div[role="button"][aria-label="Close"]');
            if (close instanceof HTMLElement && isVisible(close)) {
              close.click();
              return { ok: true };
            }
            const closeByText = Array.from(dialog.querySelectorAll('button, div[role="button"]')).find((el) => {
              const buttonText = (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              return isVisible(el) && (buttonText === 'close' || buttonText === 'cancel' || buttonText === '取消');
            });
            if (closeByText instanceof HTMLElement) {
              closeByText.click();
              return { ok: true };
            }
          }
        }

        return { ok: false };
      })()
    `) as { ok?: boolean };

    if (!result?.ok) return;
    await page.wait({ time: 0.5 });
  }
}

async function findUploadSelectors(page: IPage): Promise<string[]> {
  const result = await page.evaluate(`
    (() => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      };
      const hasButtonText = (root, labels) => {
        if (!root || !(root instanceof Element)) return false;
        return Array.from(root.querySelectorAll('button, div[role="button"], span'))
          .some((el) => {
            const text = (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            return labels.some((label) => text === label.toLowerCase());
          });
      };

      const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      const candidates = inputs.filter((el) => {
        if (!(el instanceof HTMLInputElement)) return false;
        if (el.disabled) return false;
        const accept = (el.getAttribute('accept') || '').toLowerCase();
        return !accept || accept.includes('image') || accept.includes('.jpg') || accept.includes('.jpeg') || accept.includes('.png') || accept.includes('.webp');
      });

      const dialogInputs = candidates.filter((el) => {
        const dialog = el.closest('[role="dialog"]');
        return hasButtonText(dialog, ['Select from computer', '从电脑中选择']);
      });

      const visibleDialogInputs = dialogInputs.filter((el) => {
        const dialog = el.closest('[role="dialog"]');
        return dialog instanceof HTMLElement && isVisible(dialog);
      });

      const pickerInputs = candidates.filter((el) => {
        return hasButtonText(el.parentElement, ['Select from computer', '从电脑中选择']);
      });

      const primary = visibleDialogInputs.length
        ? [visibleDialogInputs[visibleDialogInputs.length - 1]]
        : dialogInputs.length
          ? [dialogInputs[dialogInputs.length - 1]]
          : [];
      const ordered = [...primary, ...pickerInputs, ...candidates]
        .filter((el, index, arr) => arr.indexOf(el) === index);
      if (!ordered.length) return { ok: false };

      document.querySelectorAll('[data-opencli-ig-upload-index]').forEach((el) => el.removeAttribute('data-opencli-ig-upload-index'));
      const selectors = ordered.map((input, index) => {
        input.setAttribute('data-opencli-ig-upload-index', String(index));
        return '[data-opencli-ig-upload-index="' + index + '"]';
      });
      return { ok: true, selectors };
    })()
  `) as { ok?: boolean; selectors?: string[] };

  if (!result?.ok || !result.selectors?.length) {
    throw new CommandExecutionError('Instagram upload input not found', 'Open the new-post composer in a logged-in browser session and retry');
  }
  return result.selectors;
}

async function resolveUploadSelectors(page: IPage): Promise<string[]> {
  try {
    return await findUploadSelectors(page);
  } catch (error) {
    if (!(error instanceof CommandExecutionError) || !error.message.includes('upload input not found')) {
      throw error;
    }

    await ensureComposerOpen(page);
    await page.wait({ time: 1 });
    return findUploadSelectors(page);
  }
}

async function injectImageViaBrowser(page: IPage, imagePath: string, selector: string): Promise<void> {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png'
    ? 'image/png'
    : ext === '.webp'
      ? 'image/webp'
      : 'image/jpeg';
  const base64 = fs.readFileSync(imagePath).toString('base64');
  const chunkKey = `__opencliInstagramUpload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const chunkSize = 256 * 1024;

  await page.evaluate(`
    (() => {
      window[${JSON.stringify(chunkKey)}] = [];
      return { ok: true };
    })()
  `);

  for (let offset = 0; offset < base64.length; offset += chunkSize) {
    const chunk = base64.slice(offset, offset + chunkSize);
    await page.evaluate(`
      (() => {
        const key = ${JSON.stringify(chunkKey)};
        const chunk = ${JSON.stringify(chunk)};
        const parts = Array.isArray(window[key]) ? window[key] : [];
        parts.push(chunk);
        window[key] = parts;
        return { ok: true, count: parts.length };
      })()
    `);
  }

  const result = await page.evaluate(`
    (() => {
      const selector = ${JSON.stringify(selector)};
      const key = ${JSON.stringify(chunkKey)};
      const payload = {
        name: ${JSON.stringify(path.basename(imagePath))},
        type: ${JSON.stringify(mimeType)},
        base64: Array.isArray(window[key]) ? window[key].join('') : '',
      };

      const cleanup = () => { try { delete window[key]; } catch {} };
      const input = document.querySelector(selector);
      if (!(input instanceof HTMLInputElement)) {
        cleanup();
        return { ok: false, error: 'File input not found for fallback injection' };
      }

      try {
        const binary = atob(payload.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: payload.type });
        const file = new File([blob], payload.name, { type: payload.type });
        const dt = new DataTransfer();
        dt.items.add(file);
        Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        cleanup();
        return { ok: true, count: dt.files.length };
      } catch (error) {
        cleanup();
        return { ok: false, error: String(error) };
      }
    })()
  `) as { ok?: boolean; error?: string };

  if (!result?.ok) {
    throw new CommandExecutionError(result?.error || 'Instagram fallback file injection failed');
  }
}

async function dispatchUploadEvents(page: IPage, selector: string): Promise<void> {
  await page.evaluate(`
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement)) return { ok: false };
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()
  `);
}

async function hasPreviewSurface(page: IPage): Promise<boolean> {
  const result = await page.evaluate(`
    (() => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      };
      const hasVisibleButton = (labels) => {
        return Array.from(document.querySelectorAll('button, div[role="button"]')).some((el) => {
          const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          return isVisible(el) && labels.includes(text);
        });
      };
      const hasCaption = !!document.querySelector('textarea, [contenteditable="true"]');
      const hasPicker = hasVisibleButton(['Select from computer', '从电脑中选择']);
      const hasNext = hasVisibleButton(['Next', '下一步']);
      return { ok: hasCaption || (!hasPicker && hasNext) };
    })()
  `) as { ok?: boolean };

  return !!result?.ok;
}

async function uploadImage(page: IPage, imagePath: string, selector: string): Promise<void> {
  if (!page.setFileInput) {
    throw new CommandExecutionError(
      'Instagram posting requires Browser Bridge file upload support',
      'Use Browser Bridge or another browser mode that supports setFileInput',
    );
  }

  try {
    await page.setFileInput([imagePath], selector);
    await dispatchUploadEvents(page, selector);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Unknown action') && !message.includes('set-file-input') && !message.includes('not supported')) {
      throw error;
    }
    await injectImageViaBrowser(page, imagePath, selector);
  }
}

async function waitForPreview(page: IPage): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (await hasPreviewSurface(page)) return;
    if (attempt < 11) await page.wait({ time: 1 });
  }

  await page.screenshot({ path: '/tmp/instagram_post_preview_debug.png' });
  throw new CommandExecutionError(
    'Instagram image preview did not appear after upload',
    'The selected file input may not match the active composer; inspect /tmp/instagram_post_preview_debug.png',
  );
}

async function waitForPreviewMaybe(page: IPage, maxWaitSeconds = 4): Promise<boolean> {
  const attempts = Math.max(1, Math.ceil(maxWaitSeconds * 2));
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await hasPreviewSurface(page)) return true;
    if (attempt < attempts - 1) await page.wait({ time: 0.5 });
  }
  return false;
}

async function clickAction(page: IPage, labels: string[], scope: 'any' | 'media' | 'caption' = 'any'): Promise<string> {
  const result = await page.evaluate(`
    ((labels, scope) => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      };

      const matchesScope = (dialog) => {
        if (!(dialog instanceof HTMLElement) || !isVisible(dialog)) return false;
        const text = (dialog.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        if (scope === 'caption') {
          return !!dialog.querySelector('textarea, [contenteditable="true"]')
            || text.includes('write a caption')
            || text.includes('add location')
            || text.includes('add collaborators')
            || text.includes('accessibility')
            || text.includes('advanced settings');
        }
        if (scope === 'media') {
          return !!dialog.querySelector('input[type="file"]')
            || text.includes('select from computer')
            || text.includes('crop')
            || text.includes('filters')
            || text.includes('adjustments')
            || text.includes('open media gallery')
            || text.includes('select crop')
            || text.includes('select zoom');
        }
        return true;
      };

      const containers = [];
      if (scope !== 'any') {
        containers.push(...Array.from(document.querySelectorAll('[role="dialog"]')).filter(matchesScope));
      }
      containers.push(document.body);

      for (const container of containers) {
        const nodes = Array.from(container.querySelectorAll('button, div[role="button"]'));
        for (const node of nodes) {
          const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!text || !labels.includes(text)) continue;
          if (node instanceof HTMLElement && isVisible(node) && node.getAttribute('aria-disabled') !== 'true') {
            node.click();
            return { ok: true, label: text };
          }
        }
      }
      return { ok: false };
    })(${JSON.stringify(labels)}, ${JSON.stringify(scope)})
  `) as { ok?: boolean; label?: string };

  if (!result?.ok) {
    throw new CommandExecutionError(`Instagram action button not found: ${labels.join(' / ')}`);
  }
  return result.label || labels[0]!;
}

async function hasCaptionEditor(page: IPage): Promise<boolean> {
  const result = await page.evaluate(`
    (() => {
      const editable = document.querySelector('textarea, [contenteditable="true"]');
      return { ok: !!editable };
    })()
  `) as { ok?: boolean };

  return !!result?.ok;
}

async function isCaptionStage(page: IPage): Promise<boolean> {
  const result = await page.evaluate(`
    (() => {
      const editable = document.querySelector('textarea, [contenteditable="true"]');
      const dialogText = Array.from(document.querySelectorAll('[role="dialog"]'))
        .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase())
        .join(' ');
      return {
        ok: !!editable
          || dialogText.includes('write a caption')
          || dialogText.includes('add location')
          || dialogText.includes('add collaborators')
          || dialogText.includes('advanced settings'),
      };
    })()
  `) as { ok?: boolean };

  return !!result?.ok;
}

async function advanceToCaptionEditor(page: IPage): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isCaptionStage(page)) {
      return;
    }
    try {
      await clickAction(page, ['Next', '下一步'], 'media');
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        await page.wait({ time: 1.5 });
        if (await isCaptionStage(page)) {
          return;
        }
      }
      throw error;
    }
    await page.wait({ time: 1.5 });
    if (await hasCaptionEditor(page)) {
      return;
    }
  }

  await page.screenshot({ path: '/tmp/instagram_post_caption_debug.png' });
  throw new CommandExecutionError(
    'Instagram caption editor did not appear',
    'Instagram may have changed the publish flow; inspect /tmp/instagram_post_caption_debug.png',
  );
}

async function waitForCaptionEditor(page: IPage): Promise<void> {
  if (!(await hasCaptionEditor(page))) {
    await page.screenshot({ path: '/tmp/instagram_post_caption_debug.png' });
    throw new CommandExecutionError(
      'Instagram caption editor did not appear',
      'Instagram may have changed the publish flow; inspect /tmp/instagram_post_caption_debug.png',
    );
  }
}

async function focusCaptionEditorForNativeInsert(page: IPage): Promise<boolean> {
  const result = await page.evaluate(`
    (() => {
      const textarea = document.querySelector('[aria-label="Write a caption..."], textarea');
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
        textarea.select();
        return { ok: true, kind: 'textarea' };
      }

      const editor = document.querySelector('[aria-label="Write a caption..."][contenteditable="true"]')
        || document.querySelector('[contenteditable="true"]');
      if (!(editor instanceof HTMLElement)) return { ok: false };

      const lexical = editor.__lexicalEditor;
      try {
        if (lexical && typeof lexical.getEditorState === 'function' && typeof lexical.parseEditorState === 'function') {
          const emptyState = {
            root: {
              children: [{
                children: [],
                direction: null,
                format: '',
                indent: 0,
                textFormat: 0,
                textStyle: '',
                type: 'paragraph',
                version: 1,
              }],
              direction: null,
              format: '',
              indent: 0,
              type: 'root',
              version: 1,
            },
          };
          const nextState = lexical.parseEditorState(JSON.stringify(emptyState));
          try {
            lexical.setEditorState(nextState, { tag: 'history-merge', discrete: true });
          } catch {
            lexical.setEditorState(nextState);
          }
        } else {
          editor.textContent = '';
        }
      } catch {
        editor.textContent = '';
      }

      editor.focus();
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.addRange(range);
      }

      return { ok: true, kind: 'contenteditable' };
    })()
  `) as { ok?: boolean };

  return !!result?.ok;
}

async function fillCaption(page: IPage, content: string): Promise<void> {
  if (page.insertText && await focusCaptionEditorForNativeInsert(page)) {
    try {
      await page.insertText(content);
      await page.wait({ time: 0.3 });
      await page.evaluate(`
        (() => {
          const textarea = document.querySelector('[aria-label="Write a caption..."], textarea');
          if (textarea instanceof HTMLTextAreaElement) {
            textarea.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
            textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            textarea.blur();
            return { ok: true };
          }

          const editor = document.querySelector('[aria-label="Write a caption..."][contenteditable="true"]')
            || document.querySelector('[contenteditable="true"]');
          if (!(editor instanceof HTMLElement)) return { ok: false };
          try {
            editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
          } catch {
            editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          }
          editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          editor.blur();
          return { ok: true };
        })()
      `);
      return;
    } catch {
      // Fall back to browser-side editor manipulation below.
    }
  }

  const result = await page.evaluate(`
    ((content) => {
      const createParagraph = (text) => ({
        children: text
          ? [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }]
          : [],
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        type: 'paragraph',
        version: 1,
      });

      const textarea = document.querySelector('[aria-label="Write a caption..."], textarea');
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
        const dt = new DataTransfer();
        dt.setData('text/plain', content);
        textarea.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }));
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, content);
        textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return { ok: true, mode: 'textarea' };
      }

      const editor = document.querySelector('[aria-label="Write a caption..."][contenteditable="true"]')
        || document.querySelector('[contenteditable="true"]');
      if (editor instanceof HTMLElement) {
        editor.focus();
        const lexical = editor.__lexicalEditor;
        if (lexical && typeof lexical.getEditorState === 'function' && typeof lexical.parseEditorState === 'function') {
          const currentState = lexical.getEditorState && lexical.getEditorState();
          const base = currentState && typeof currentState.toJSON === 'function' ? currentState.toJSON() : {};
          const lines = String(content).split(/\\r?\\n/);
          const paragraphs = lines.map((line) => createParagraph(line));
          base.root = {
            children: paragraphs.length ? paragraphs : [createParagraph('')],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          };

          const nextState = lexical.parseEditorState(JSON.stringify(base));
          try {
            lexical.setEditorState(nextState, { tag: 'history-merge', discrete: true });
          } catch {
            lexical.setEditorState(nextState);
          }

          editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          const nextCurrentState = lexical.getEditorState && lexical.getEditorState();
          const pendingState = lexical._pendingEditorState;
          return {
            ok: true,
            mode: 'lexical',
            value: editor.textContent || '',
            current: nextCurrentState && typeof nextCurrentState.toJSON === 'function' ? nextCurrentState.toJSON() : null,
            pending: pendingState && typeof pendingState.toJSON === 'function' ? pendingState.toJSON() : null,
          };
        }

        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(editor);
          selection.addRange(range);
        }
        const dt = new DataTransfer();
        dt.setData('text/plain', content);
        editor.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }));
        return { ok: true, mode: 'contenteditable', value: editor.textContent || '' };
      }

      return { ok: false };
    })(${JSON.stringify(content)})
  `) as { ok?: boolean };

  if (!result?.ok) {
    throw new CommandExecutionError('Failed to fill Instagram caption');
  }
}

async function captionMatches(page: IPage, content: string): Promise<boolean> {
  const result = await page.evaluate(`
    ((content) => {
      const normalized = content.trim();
      const readLexicalText = (node) => {
        if (!node || typeof node !== 'object') return '';
        if (node.type === 'text' && typeof node.text === 'string') return node.text;
        if (!Array.isArray(node.children)) return '';
        if (node.type === 'root') {
          return node.children.map((child) => readLexicalText(child)).join('\\n');
        }
        if (node.type === 'paragraph') {
          return node.children.map((child) => readLexicalText(child)).join('');
        }
        return node.children.map((child) => readLexicalText(child)).join('');
      };

      const textarea = document.querySelector('[aria-label="Write a caption..."], textarea');
      if (textarea instanceof HTMLTextAreaElement) {
        return { ok: textarea.value.trim() === normalized };
      }

      const editor = document.querySelector('[aria-label="Write a caption..."][contenteditable="true"]')
        || document.querySelector('[contenteditable="true"]');
      if (editor instanceof HTMLElement) {
        const lexical = editor.__lexicalEditor;
        if (lexical && typeof lexical.getEditorState === 'function') {
          const currentState = lexical.getEditorState();
          const pendingState = lexical._pendingEditorState;
          const current = currentState && typeof currentState.toJSON === 'function' ? currentState.toJSON() : null;
          const pending = pendingState && typeof pendingState.toJSON === 'function' ? pendingState.toJSON() : null;
          const currentText = readLexicalText(current && current.root).trim();
          const pendingText = readLexicalText(pending && pending.root).trim();
          if (currentText === normalized || pendingText === normalized) {
            return { ok: true, currentText, pendingText };
          }
        }

        const text = (editor.textContent || '').replace(/\\u00a0/g, ' ').trim();
        if (text === normalized) return { ok: true };

        const counters = Array.from(document.querySelectorAll('div, span'))
          .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean);
        const counter = counters.find((value) => /\\d+\\s*\\/\\s*2,?200/.test(value));
        if (counter) {
          const match = counter.match(/(\\d+)\\s*\\/\\s*2,?200/);
          if (match && Number(match[1]) >= normalized.length) return { ok: true };
        }

        return { ok: false, text, counter: counter || '' };
      }

      return { ok: false };
    })(${JSON.stringify(content)})
  `) as { ok?: boolean };

  return !!result?.ok;
}

async function ensureCaptionFilled(page: IPage, content: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await captionMatches(page, content)) {
      return;
    }
    if (attempt < 5) {
      await page.wait({ time: 0.5 });
    }
  }

  await page.screenshot({ path: '/tmp/instagram_post_caption_fill_debug.png' });
  throw new CommandExecutionError(
    'Instagram caption did not stick before sharing',
    'Inspect /tmp/instagram_post_caption_fill_debug.png for the caption editor state',
  );
}

async function waitForPublishSuccess(page: IPage): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await page.evaluate(`
      (() => {
        const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
        const dialogText = Array.from(document.querySelectorAll('[role="dialog"]'))
          .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
          .join(' ');
        const url = window.location.href;
        const combined = (dialogText + ' ' + bodyText).toLowerCase();
        const failed = /couldn['’]t be shared|could not be shared|failed to share|share failed|something went wrong|try again|无法分享|分享失败/.test(combined);
        const shared = /post shared|your post has been shared|已分享|已发布/.test(combined)
          || /\\/p\\//.test(url);
        return { ok: shared, failed, url: /\\/p\\//.test(url) ? url : '' };
      })()
    `) as { ok?: boolean; failed?: boolean; url?: string };

    if (result?.failed) {
      await page.screenshot({ path: '/tmp/instagram_post_share_debug.png' });
      throw new CommandExecutionError(
        'Instagram post share failed',
        'Inspect /tmp/instagram_post_share_debug.png for the share failure state',
      );
    }

    if (result?.ok) {
      return result.url || '';
    }
    if (attempt < 29) {
      await page.wait({ time: 1 });
    }
  }

  await page.screenshot({ path: '/tmp/instagram_post_share_debug.png' });
  throw new CommandExecutionError(
    'Instagram post share confirmation did not appear',
    'Inspect /tmp/instagram_post_share_debug.png for the final publish state',
  );
}

async function resolveCurrentUserId(page: IPage): Promise<string> {
  const cookies = await page.getCookies({ domain: 'instagram.com' });
  return cookies.find((cookie) => cookie.name === 'ds_user_id')?.value || '';
}

async function resolveProfileUrl(page: IPage, currentUserId = ''): Promise<string> {
  if (currentUserId) {
    const apiResult = await page.evaluate(`
      (async () => {
        const userId = ${JSON.stringify(currentUserId)};
        try {
          const res = await fetch(
            'https://www.instagram.com/api/v1/users/' + encodeURIComponent(userId) + '/info/',
            {
              credentials: 'include',
              headers: { 'X-IG-App-ID': '936619743392459' },
            },
          );
          if (!res.ok) return { ok: false };
          const data = await res.json();
          const username = data?.user?.username || '';
          return { ok: !!username, username };
        } catch {
          return { ok: false };
        }
      })()
    `) as { ok?: boolean; username?: string };

    if (apiResult?.ok && apiResult.username) {
      return new URL(`/${apiResult.username}/`, INSTAGRAM_HOME_URL).toString();
    }
  }

  const result = await page.evaluate(`
    (() => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      };

      const anchors = Array.from(document.querySelectorAll('a[href]'))
        .filter((el) => el instanceof HTMLAnchorElement && isVisible(el))
        .map((el) => ({
          href: el.getAttribute('href') || '',
          text: (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase(),
          aria: (el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase(),
        }))
        .filter((el) => /^\\/[^/?#]+\\/$/.test(el.href));

      const explicitProfile = anchors.find((el) => el.text === 'profile' || el.aria === 'profile')?.href || '';
      const path = explicitProfile;
      return { ok: !!path, path };
    })()
  `) as { ok?: boolean; path?: string };

  if (!result?.ok || !result.path) return '';
  return new URL(result.path, INSTAGRAM_HOME_URL).toString();
}

async function collectVisibleProfilePostPaths(page: IPage): Promise<string[]> {
  const result = await page.evaluate(`
    (() => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      };

      const hrefs = Array.from(document.querySelectorAll('a[href*="/p/"]'))
        .filter((el) => el instanceof HTMLAnchorElement && isVisible(el))
        .map((el) => el.getAttribute('href') || '')
        .filter((href) => /^\\/(?:[^/?#]+\\/)?p\\/[^/?#]+\\/?$/.test(href))
        .filter((href, index, arr) => arr.indexOf(href) === index);

      return { ok: hrefs.length > 0, hrefs };
    })()
  `) as { ok?: boolean; hrefs?: string[] };

  return Array.isArray(result?.hrefs) ? result.hrefs.filter(Boolean) : [];
}

async function captureExistingProfilePostPaths(page: IPage): Promise<Set<string>> {
  const currentUserId = await resolveCurrentUserId(page);
  if (!currentUserId) return new Set();

  const profileUrl = await resolveProfileUrl(page, currentUserId);
  if (!profileUrl) return new Set();

  try {
    await page.goto(profileUrl);
    await page.wait({ time: 3 });
    return new Set(await collectVisibleProfilePostPaths(page));
  } catch {
    return new Set();
  }
}

async function resolveLatestPostUrl(page: IPage, existingPostPaths: ReadonlySet<string>): Promise<string> {
  const currentUrl = await page.getCurrentUrl?.();
  if (currentUrl && /\/p\//.test(currentUrl)) return currentUrl;

  const currentUserId = await resolveCurrentUserId(page);
  const profileUrl = await resolveProfileUrl(page, currentUserId);
  if (!profileUrl) return '';

  await page.goto(profileUrl);
  await page.wait({ time: 4 });

  for (let attempt = 0; attempt < 8; attempt++) {
    const hrefs = await collectVisibleProfilePostPaths(page);
    const href = hrefs.find((candidate) => !existingPostPaths.has(candidate)) || '';
    if (href) {
      return new URL(href, INSTAGRAM_HOME_URL).toString();
    }

    if (attempt < 7) await page.wait({ time: 1 });
  }

  return '';
}

cli({
  site: 'instagram',
  name: 'post',
  description: 'Post a single-image Instagram feed post',
  domain: 'www.instagram.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'image', required: true, help: 'Path to a single image file' },
    { name: 'content', positional: true, required: true, help: 'Caption text' },
  ],
  columns: ['status', 'detail', 'url'],
  func: async (page: IPage | null, kwargs) => {
    const browserPage = requirePage(page);
    const imagePath = validateImagePath(String(kwargs.image ?? ''));
    const content = String(kwargs.content ?? '').trim();
    const existingPostPaths = await captureExistingProfilePostPaths(browserPage);

    let lastError: unknown;
    let lastSpecificCommandError: CommandExecutionError | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      let shareClicked = false;
      try {
        await browserPage.goto(INSTAGRAM_HOME_URL);
        await browserPage.wait({ time: 2 });
        await dismissResidualDialogs(browserPage);

        await ensureComposerOpen(browserPage);
        const uploadSelectors = await resolveUploadSelectors(browserPage);
        let uploaded = false;
        for (const selector of uploadSelectors) {
          await uploadImage(browserPage, imagePath, selector);
          if (await waitForPreviewMaybe(browserPage, 4)) {
            uploaded = true;
            break;
          }
        }
        if (!uploaded) {
          await waitForPreview(browserPage);
        }
        await advanceToCaptionEditor(browserPage);
        await fillCaption(browserPage, content);
        await ensureCaptionFilled(browserPage, content);
        await clickAction(browserPage, ['Share', '分享'], 'caption');
        shareClicked = true;
        let url = await waitForPublishSuccess(browserPage);
        if (!url) {
          url = await resolveLatestPostUrl(browserPage, existingPostPaths);
        }

        return [{
          status: '✅ Posted',
          detail: 'Single image post shared successfully',
          url,
        }];
      } catch (error) {
        lastError = error;
        if (error instanceof CommandExecutionError && error.message !== 'Failed to open Instagram post composer') {
          lastSpecificCommandError = error;
        }
        if (error instanceof AuthRequiredError) throw error;
        if (shareClicked) {
          throw error;
        }
        if (!(error instanceof CommandExecutionError) || attempt === 2) {
          if (error instanceof CommandExecutionError && error.message === 'Failed to open Instagram post composer' && lastSpecificCommandError) {
            throw lastSpecificCommandError;
          }
          throw error;
        }
        await dismissResidualDialogs(browserPage);
        await browserPage.wait({ time: 1 });
      }
    }

    throw lastError instanceof Error ? lastError : new CommandExecutionError('Instagram post failed');
  },
});
