import { AuthRequiredError, EmptyResultError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';

/**
 * band bands — List all Bands you belong to.
 *
 * Band.us renders the full band list in the left sidebar of the home page for
 * logged-in users, so we can extract everything we need from the DOM without
 * XHR interception or any secondary navigation.
 *
 * Each sidebar item is an <a href="/band/{band_no}/..."> link whose text and
 * data attributes carry the band name and member count.
 */
cli({
  site: 'band',
  name: 'bands',
  description: 'List all Bands you belong to',
  domain: 'www.band.us',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  columns: ['band_no', 'name', 'members'],

  func: async (page, _kwargs) => {
    const isLoggedIn = await page.evaluate(`() => document.cookie.includes('band_session')`);
    if (!isLoggedIn) throw new AuthRequiredError('band.us', 'Not logged in to Band');

    // Extract the band list from the sidebar. Poll until at least one band link
    // appears (React hydration may take a moment after navigation).
    const bands: { band_no: number; name: string; members: number }[] = await page.evaluate(`
      (async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));

        // Wait up to 9 s for sidebar band links to render.
        for (let i = 0; i < 30; i++) {
          if (document.querySelector('a[href*="/band/"]')) break;
          await sleep(300);
        }

        const seen = new Set();
        const results = [];

        for (const a of Array.from(document.querySelectorAll('a[href*="/band/"]'))) {
          const m = a.getAttribute('href').match(/\\/band\\/(\\d+)/);
          if (!m) continue;
          const bandNo = Number(m[1]);
          if (seen.has(bandNo)) continue;
          seen.add(bandNo);

          // Band name: prefer a dedicated name element; fall back to the link's
          // own text content (stripping any nested numeric badge text).
          const nameEl = a.querySelector('._bandName, .bandName, .name, strong');
          const name = (nameEl?.textContent || a.textContent || '').trim()
            .replace(/\\s*\\d+\\s*$/, '') // strip trailing member-count badge
            .trim();
          if (!name) continue;

          // Member count may appear as a small badge element inside the link.
          const memberEl = a.querySelector('._memberCount, .memberCount, .count');
          const members = memberEl ? parseInt(memberEl.textContent, 10) || 0 : 0;

          results.push({ band_no: bandNo, name, members });
        }

        return results;
      })()
    `);

    if (!bands || bands.length === 0) {
      throw new EmptyResultError('band bands', 'No bands found in sidebar — are you logged in?');
    }

    return bands;
  },
});
