import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';

function truthy(value) {
  return value === true || /^(1|true|yes|y|send)$/i.test(String(value || ''));
}

export const __test__ = { truthy };

cli({
  site: 'facebook',
  name: 'marketplace-reply',
  description: 'Draft or send a reply in a Facebook Marketplace conversation',
  domain: 'www.facebook.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'text', positional: true, required: true, help: 'Reply text to draft/send' },
    { name: 'buyer', help: 'Buyer name to match in Marketplace inbox' },
    { name: 'listing', help: 'Listing title/text to match in Marketplace inbox' },
    { name: 'send', default: 'false', help: 'Actually send the reply. Defaults to false/draft-only; pass --send true to send.' },
  ],
  columns: ['status', 'buyer', 'listing', 'sent', 'message'],
  func: async (page, args) => {
    if (!page) throw new CliError('NO_BROWSER', 'Browser session required for facebook marketplace-reply');
    const text = String(args.text || '').trim();
    if (!text) throw new CliError('MISSING_TEXT', 'Reply text is required');
    const buyer = String(args.buyer || '').trim();
    const listing = String(args.listing || '').trim();
    if (!buyer && !listing) {
      throw new CliError('MISSING_TARGET', 'Pass --buyer and/or --listing to choose the Marketplace conversation');
    }
    const shouldSend = truthy(args.send);

    await page.goto('https://www.facebook.com/marketplace/inbox/');
    await page.wait(4);

    const opened = await page.evaluate(`(() => {
      const buyer = ${JSON.stringify(buyer)};
      const listing = ${JSON.stringify(listing)};
      const clean = (s) => String(s || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
      const includes = (haystack, needle) => !needle || clean(haystack).toLowerCase().includes(clean(needle).toLowerCase());
      const nodes = [...document.querySelectorAll('[role="main"] [role="button"], [role="main"] a, [role="main"] [role="listitem"], [aria-label*="Open chat titled"]')];
      const match = nodes.find((el) => {
        const text = clean((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || ''));
        return includes(text, buyer) && includes(text, listing) && !/^(Marketplace|Inbox|Selling|Buying)$/i.test(text);
      });
      if (!match) {
        return { ok: false, reason: 'conversation_not_found', text: clean(document.body.innerText).slice(0, 1200) };
      }
      const label = clean(match.innerText || match.getAttribute('aria-label') || '');
      const clickable = match.closest('[role="button"],a,[tabindex]') || match;
      clickable.scrollIntoView({ block: 'center' });
      ['mouseover', 'mousedown', 'mouseup', 'click'].forEach((type) => clickable.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })));
      return { ok: true, label };
    })()`);

    if (!opened?.ok) {
      throw new CliError('CONVERSATION_NOT_FOUND', 'Could not find matching Marketplace conversation', `Try a more exact --buyer or --listing. ${opened?.reason || ''}`);
    }

    await page.wait(2);

    const drafted = await page.evaluate(`(() => {
      const text = ${JSON.stringify(text)};
      const clean = (s) => String(s || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
      const boxes = [...document.querySelectorAll('[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"]')]
        .filter((el) => {
          const aria = el.getAttribute('aria-label') || '';
          const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          return visible && (/Write to|Message|Aa/i.test(aria) || clean(el.innerText).length < 500);
        });
      const box = boxes.find((el) => /Write to/i.test(el.getAttribute('aria-label') || '')) || boxes[boxes.length - 1];
      if (!box) return { ok: false, reason: 'composer_not_found', body: clean(document.body.innerText).slice(0, 1200) };
      box.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, text);
      box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      return { ok: true, aria: box.getAttribute('aria-label') || '', draft: clean(box.innerText || box.textContent || '') };
    })()`);

    if (!drafted?.ok) {
      throw new CliError('COMPOSER_NOT_FOUND', 'Could not find Marketplace reply composer after opening the conversation', drafted?.reason || '');
    }

    if (shouldSend) {
      await page.wait(0.5);
      await page.pressKey('Enter');
      await page.wait(1.5);
    }

    const verified = await page.evaluate(`(() => {
      const text = ${JSON.stringify(text)};
      const clean = (s) => String(s || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
      const body = clean(document.body.innerText || '');
      const composers = [...document.querySelectorAll('[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"]')].map((el) => clean(el.innerText || el.textContent || '')).filter(Boolean);
      return { textVisible: body.includes(text), composerDrafts: composers, url: location.href };
    })()`);

    return [{
      status: shouldSend ? 'sent_or_attempted' : 'drafted',
      buyer,
      listing,
      sent: shouldSend,
      message: text,
      conversation: opened.label,
      composer: drafted.aria,
      verified: Boolean(verified?.textVisible),
      url: verified?.url || '',
    }];
  },
});
