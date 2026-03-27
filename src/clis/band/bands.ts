import { AuthRequiredError, EmptyResultError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';

/**
 * band bands — List all Bands you belong to.
 *
 * Band.us signs every API request with a per-request HMAC (`md` header) generated
 * by its own JavaScript, so we cannot replicate it externally. Instead we use
 * Strategy.INTERCEPT: install an XHR interceptor in the page, then trigger Band's
 * own React app to fire the request by SPA-navigating to a band page — which always
 * causes Band to call get_band_list_with_filter to re-populate the sidebar.
 */
cli({
  site: 'band',
  name: 'bands',
  description: 'List all Bands you belong to',
  domain: 'www.band.us',
  strategy: Strategy.INTERCEPT,
  browser: true,
  args: [],
  columns: ['band_no', 'name', 'members'],

  func: async (page, _kwargs) => {
    await page.goto('https://www.band.us/');
    await page.wait(2); // wait for React hydration and cookie settlement

    const isLoggedIn = await page.evaluate(`() => document.cookie.includes('band_session')`);
    if (!isLoggedIn) throw new AuthRequiredError('band.us', 'Not logged in to Band');

    // Extract any band_no from sidebar links. We need it to SPA-navigate to a band
    // page, which is the only route that reliably re-triggers get_band_list_with_filter
    // (direct / and /discover routes serve from React cache after first load).
    const bandNo = await page.evaluate(`() => {
      const m = Array.from(document.querySelectorAll('a[href*="/band/"]'))
        .map(a => a.getAttribute('href').match(/\\/band\\/(\\d+)/))
        .find(Boolean);
      return m ? m[1] : null;
    }`);
    if (!bandNo) throw new EmptyResultError('band bands', 'No band links found — are you logged in?');

    // Install XHR interceptor before triggering navigation so we don't miss the request.
    await page.installInterceptor('get_band_list_with_filter');

    // SPA navigation: history.pushState keeps the React app alive (no full reload),
    // so the interceptor stays active. PopStateEvent signals React Router to re-render.
    await page.evaluate(`() => {
      window.history.pushState({}, '', '/band/${String(bandNo)}/post');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    }`);
    await page.wait(4); // allow time for the XHR round-trip to complete

    const requests = await page.getInterceptedRequests();
    if (requests.length === 0) {
      throw new EmptyResultError('band bands', 'No band list data captured — try again.');
    }

    // result_data is an array of { band: { band_no, name, member_count, ... } }
    const bands = (requests as any[]).flatMap(req =>
      Array.isArray(req?.result_data) ? req.result_data.map((d: any) => d.band).filter(Boolean) : []
    );

    if (bands.length === 0) {
      throw new EmptyResultError('band bands', 'No bands found');
    }

    return bands.map((b: any) => ({
      band_no: b.band_no,
      name: b.name ?? '',
      members: b.member_count ?? 0,
    }));
  },
});
