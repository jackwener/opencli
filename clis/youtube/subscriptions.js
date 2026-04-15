/**
 * YouTube subscriptions — list of subscribed channels from /feed/channels.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

cli({
    site: 'youtube',
    name: 'subscriptions',
    description: 'List subscribed YouTube channels',
    domain: 'www.youtube.com',
    strategy: Strategy.COOKIE,
    args: [
        { name: 'limit', type: 'int', default: 50, help: 'Max channels to return (default 50)' },
    ],
    columns: ['rank', 'name', 'handle', 'subscribers', 'url'],
    func: async (page, kwargs) => {
        const limit = Math.min(kwargs.limit || 50, 1000);
        await page.goto('https://www.youtube.com/feed/channels');
        await page.wait(3);
        const data = await page.evaluate(`
      (async () => {
        const d = window.ytInitialData;
        if (!d) return { error: 'YouTube data not found — are you logged in?' };

        const limit = ${limit};

        const items = d.contents?.twoColumnBrowseResultsRenderer
          ?.tabs?.[0]?.tabRenderer?.content
          ?.sectionListRenderer?.contents?.[0]
          ?.itemSectionRenderer?.contents?.[0]
          ?.shelfRenderer?.content
          ?.expandedShelfContentsRenderer?.items || [];

        function extractChannel(item) {
          const ch = item.channelRenderer;
          if (!ch) return null;
          const name = ch.title?.simpleText || '';
          const handle = ch.subscriberCountText?.simpleText || '';  // confusingly stores handle
          const subscribers = ch.videoCountText?.simpleText || '';  // confusingly stores subscriber count
          const baseUrl = ch.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '';
          const channelId = ch.channelId || ch.navigationEndpoint?.browseEndpoint?.browseId || '';
          const url = baseUrl
            ? 'https://www.youtube.com' + baseUrl
            : channelId ? 'https://www.youtube.com/channel/' + channelId : '';
          return { name, handle, subscribers, url };
        }

        const channels = [];
        for (const item of items) {
          if (channels.length >= limit) break;
          const ch = extractChannel(item);
          if (ch?.name) channels.push(ch);
        }

        return channels;
      })()
    `);
        if (!Array.isArray(data)) {
            const errMsg = data && typeof data === 'object' ? String(data.error || '') : '';
            throw new CommandExecutionError(errMsg || 'Failed to fetch subscriptions — make sure you are logged into YouTube');
        }
        if (data.length === 0) {
            throw new EmptyResultError('youtube subscriptions');
        }
        return data.map((ch, i) => ({ rank: i + 1, ...ch }));
    },
});
