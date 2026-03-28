import { AuthRequiredError, EmptyResultError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';

/**
 * band mentions — Show Band notifications where you were @mentioned.
 *
 * Band.us signs every API request with a per-request HMAC (`md` header) generated
 * by its own JavaScript, so we cannot replicate it externally. Instead we use
 * Strategy.INTERCEPT: install an XHR interceptor, open the notification panel by
 * clicking the bell, then click the @メンション tab — which triggers a server-side
 * filtered get_news call containing only notifications where you were mentioned.
 *
 * The tab-click approach is preferred over client-side filtering on the full
 * notification list, because Band's server already paginates/filters correctly.
 */
cli({
  site: 'band',
  name: 'mentions',
  description: 'Show Band notifications where you are @mentioned',
  domain: 'www.band.us',
  strategy: Strategy.INTERCEPT,
  browser: true,
  args: [
    {
      name: 'filter',
      default: 'mentioned',
      choices: ['mentioned', 'all', 'post', 'comment'],
      help: 'Filter: mentioned (default) | all | post | comment',
    },
    { name: 'limit', type: 'int', default: 20, help: 'Max results' },
    { name: 'unread', type: 'bool', default: false, help: 'Show only unread notifications' },
  ],
  columns: ['time', 'band', 'type', 'from', 'text', 'url'],

  func: async (page, kwargs) => {
    const filter = kwargs.filter as string;
    const limit = kwargs.limit as number;
    const unreadOnly = kwargs.unread as boolean;

    await page.goto('https://www.band.us/');
    await page.wait(2); // wait for React hydration and cookie settlement

    const isLoggedIn = await page.evaluate(`() => document.cookie.includes('band_session')`);
    if (!isLoggedIn) throw new AuthRequiredError('band.us', 'Not logged in to Band');

    // Install XHR interceptor before any clicks so all get_news responses are captured.
    await page.installInterceptor('get_news');

    // Poll until at least `count` requests are captured, up to maxSecs seconds.
    // Avoids relying on fixed sleeps when the XHR round-trip is slow.
    const waitForCaptures = async (count: number, maxSecs = 8): Promise<any[]> => {
      for (let i = 0; i < maxSecs * 2; i++) {
        await page.wait(500);
        const reqs = await page.getInterceptedRequests();
        if (reqs.length >= count) return reqs;
      }
      return page.getInterceptedRequests();
    };

    // Click the notification bell to open the panel. This triggers an initial get_news
    // call for all notification types. The bell button is identified by class and text
    // since Band does not use aria-label on this element.
    await page.evaluate(`() => {
      const bell = Array.from(document.querySelectorAll('button._btnWidgetIcon'))
        .find(b => b.textContent && b.textContent.includes('お知らせ'));
      if (bell) bell.click();
    }`);

    let requests = await waitForCaptures(1);

    if (filter === 'mentioned') {
      // Click the @メンション tab to trigger a server-side filtered get_news call.
      // This response contains only notifications with the 'referred' filter flag,
      // which is more accurate than client-side filtering the full list.
      await page.evaluate(`() => {
        const tab = Array.from(document.querySelectorAll('button._btnFilter'))
          .find(b => b.textContent && b.textContent.includes('メンション'));
        if (tab) tab.click();
      }`);
      requests = await waitForCaptures(2);

      if (unreadOnly) {
        // 未確認のみ表示: triggers another server-side filtered get_news for unread mentions.
        await page.evaluate(`() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent && b.textContent.includes('未確認のみ'));
          if (btn) btn.click();
        }`);
        requests = await waitForCaptures(3);
      }
    }

    if (requests.length === 0) {
      throw new EmptyResultError('band mentions', 'No notification data captured. Try running the command again.');
    }

    // Use the last captured response: each UI action (bell → tab → unread toggle)
    // triggers a progressively more specific get_news call, so the last one is correct.
    const lastReq = requests[requests.length - 1] as any;
    let items: any[] = Array.isArray(lastReq?.result_data?.news) ? lastReq.result_data.news : [];

    if (items.length === 0) {
      throw new EmptyResultError('band mentions', 'No notifications found');
    }

    // For non-mention modes the server returns the full list; apply unread filter client-side.
    // For 'mentioned' mode the server already filtered by unread (via the 未確認のみ button click),
    // so skip the redundant client-side pass to avoid dropping items when is_new is absent.
    if (unreadOnly && filter !== 'mentioned') {
      items = items.filter((n: any) => n.is_new === true);
    }
    if (filter === 'post') {
      items = items.filter((n: any) => n.category === 'post');
    } else if (filter === 'comment') {
      items = items.filter((n: any) => n.category === 'comment');
    }

    // Band markup tags (<band:mention uid="...">, <band:sticker>, etc.) appear in
    // notification text; strip them to get plain readable content.
    const stripBandTags = (s: string) => s.replace(/<\/?band:[^>]+>/g, '');

    return items.slice(0, limit).map((n: any) => {
      const ts = n.created_at ? new Date(n.created_at) : null;
      return {
        time: ts
          ? ts.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          : '',
        band: n.band?.name ?? '',
        // 'filters' is Band's server-side tag array; 'referred' means you were @mentioned.
        type: n.filters?.includes('referred') ? '@mention' : n.category ?? '',
        from: n.actor?.name ?? '',
        text: stripBandTags(n.subtext ?? '').slice(0, 100),
        url: n.action?.pc ?? '',
      };
    });
  },
});
