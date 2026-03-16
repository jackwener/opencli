import { cli, Strategy } from '../../registry.js';
import * as fs from 'fs';

cli({
  site: 'twitter',
  name: 'following',
  description: 'Get accounts a Twitter/X user is following',
  domain: 'x.com',
  strategy: Strategy.INTERCEPT,
  browser: true,
  args: [
    { name: 'user', type: 'string', required: false },
    { name: 'limit', type: 'int', default: 50 },
  ],
  columns: ['screen_name', 'name', 'bio', 'followers'],
  func: async (page, kwargs) => {
    let targetUser = kwargs.user;

    // If no user is specified, we must figure out the logged-in user's handle
    if (!targetUser) {
        await page.goto('https://x.com/home');
        // wait for home page navigation
        await page.wait(5);
        
        const href = await page.evaluate(`() => {
            const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
            return link ? link.getAttribute('href') : null;
        }`);
        
        if (!href) {
            throw new Error('Could not find logged-in user profile link. Are you logged in?');
        }
        targetUser = href.replace('/', '');
    }

    // 1. Navigate to user profile page
    await page.goto(`https://x.com/${targetUser}`);
    await page.wait(3);

    // 2. Inject interceptor for Following GraphQL API
    await page.installInterceptor('Following');
    
    // 3. Click the following link inside the profile page
    await page.evaluate(`() => {
        const target = '${targetUser}';
        const link = document.querySelector('a[href="/' + target + '/following"]');
        if (link) link.click();
    }`);
    await page.wait(3);

    // 4. Trigger API by scrolling
    await page.autoScroll({ times: Math.ceil(kwargs.limit / 20), delayMs: 2000 });

    // 4. Retrieve data from opencli's registered interceptors
    const requests = await page.getInterceptedRequests();
    
    // Debug: Force dump all intercepted XHRs that match following
    if (!requests || requests.length === 0) {
       console.log('No Following requests captured by the interceptor backend.');
       return [];
    }

    let results: any[] = [];
    for (const req of requests) {
      try {
        let instructions = req.data?.data?.user?.result?.timeline?.timeline?.instructions;
        if (!instructions) continue;

        let addEntries = instructions.find((i: any) => i.type === 'TimelineAddEntries');
        if (!addEntries) {
             addEntries = instructions.find((i: any) => i.entries && Array.isArray(i.entries));
        }
        
        if (!addEntries) continue;

        for (const entry of addEntries.entries) {
          if (!entry.entryId.startsWith('user-')) continue;

          const item = entry.content?.itemContent?.user_results?.result;
          if (!item || item.__typename !== 'User') continue;

          // Twitter GraphQL sometimes nests `core` differently depending on the endpoint profile state
          const core = item.core || {};
          const legacy = item.legacy || {};
          
          results.push({
            screen_name: core.screen_name || legacy.screen_name || 'unknown',
            name: core.name || legacy.name || 'unknown',
            bio: legacy.description || item.profile_bio?.description || '',
            followers: legacy.followers_count || legacy.normal_followers_count || 0
          });
        }
      } catch (e) {
        // ignore parsing errors for individual payloads
      }
    }

    // Deduplicate by screen_name in case multiple scrolls caught the same
    const unique = new Map();
    results.forEach(r => unique.set(r.screen_name, r));
    const deduplicatedResults = Array.from(unique.values());

    return deduplicatedResults.slice(0, kwargs.limit);
  }
});
