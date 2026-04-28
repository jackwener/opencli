import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { resolveTwitterQueryId } from './shared.js';
import { openTweetDb } from './db.js';

const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const USER_BY_SCREEN_NAME_QUERY_ID = 'qRednkZG-rn1P6b48NINmQ';
const USER_TWEETS_QUERY_ID_FALLBACK = 'E3opETHurmVJflFsUBVuUQ';
const USER_TWEETS_OPERATION = 'UserTweets';

const FEATURES = {
    rweb_video_screen_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    premium_content_api_read_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_jetfuel_frame: false,
    responsive_web_grok_share_attachment_enabled: true,
    articles_preview_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    responsive_web_grok_show_grok_translated_post: false,
    responsive_web_grok_analysis_button_from_backend: false,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_grok_image_annotation_enabled: true,
    responsive_web_enhance_cards_enabled: false,
};

function buildUserTweetsUrl(queryId, userId, count, cursor) {
    const vars = {
        userId: String(userId),
        count,
        includePromotedContent: false,
        withQuickPromoteEligibilityTweetFields: false,
        withVoice: true,
    };
    if (cursor)
        vars.cursor = cursor;
    return `/i/api/graphql/${queryId}/${USER_TWEETS_OPERATION}`
        + `?variables=${encodeURIComponent(JSON.stringify(vars))}`
        + `&features=${encodeURIComponent(JSON.stringify(FEATURES))}`;
}

function toIsoDate(twitterDate) {
    if (!twitterDate)
        return '';
    const d = new Date(twitterDate);
    return isNaN(d.getTime()) ? twitterDate : d.toISOString();
}

export function extractTweet(result, seen) {
    if (!result)
        return null;
    const tw = result.tweet || result;
    if (!tw.rest_id || seen.has(tw.rest_id))
        return null;
    seen.add(tw.rest_id);
    const legacy = tw.legacy || {};
    const user = tw.core?.user_results?.result;
    const screenName = user?.legacy?.screen_name || user?.core?.screen_name || 'unknown';
    const noteText = tw.note_tweet?.note_tweet_results?.result?.text;
    const id = tw.rest_id;
    return {
        id,
        author: screenName,
        text: noteText || legacy.full_text || '',
        created_at: toIsoDate(legacy.created_at),
        url: `https://x.com/${screenName}/status/${id}`,
    };
}

export function parseUserTweets(data, seen) {
    const tweets = [];
    let nextCursor = null;
    const instructions = data?.data?.user?.result?.timeline_v2?.timeline?.instructions
        || data?.data?.user?.result?.timeline?.timeline?.instructions
        || [];
    for (const inst of instructions) {
        if (inst.type === 'TimelinePinEntry')
            continue;
        if (inst.type && inst.type !== 'TimelineAddEntries')
            continue;
        for (const entry of inst.entries || []) {
            const entryId = entry.entryId || '';
            const content = entry.content;
            if (content?.entryType === 'TimelineTimelineCursor' || content?.__typename === 'TimelineTimelineCursor') {
                if (content.cursorType === 'Bottom' || content.cursorType === 'ShowMore')
                    nextCursor = content.value;
                continue;
            }
            if (entryId.startsWith('cursor-bottom-') || entryId.startsWith('cursor-showMore-')) {
                nextCursor = content?.value || content?.itemContent?.value || nextCursor;
                continue;
            }
            if (entryId.startsWith('promoted-tweet-') || entryId.startsWith('who-to-follow-'))
                continue;
            if (content?.entryType === 'TimelineTimelineModule' || content?.__typename === 'TimelineTimelineModule') {
                for (const item of content?.items || []) {
                    const nested = extractTweet(item.item?.itemContent?.tweet_results?.result, seen);
                    if (nested)
                        tweets.push(nested);
                }
                continue;
            }
            const tw = extractTweet(content?.itemContent?.tweet_results?.result, seen);
            if (tw)
                tweets.push(tw);
        }
    }
    return { tweets, nextCursor };
}

async function resolveUserId(page, username) {
    const queryId = await resolveTwitterQueryId(page, 'UserByScreenName', USER_BY_SCREEN_NAME_QUERY_ID);
    const result = await page.evaluate(`
    async () => {
      const screenName = ${JSON.stringify(username)};
      const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
      if (!ct0) return {error: 'No ct0 cookie — not logged into x.com'};
      const bearer = ${JSON.stringify(BEARER_TOKEN)};
      const headers = {
        'Authorization': 'Bearer ' + decodeURIComponent(bearer),
        'X-Csrf-Token': ct0,
        'X-Twitter-Auth-Type': 'OAuth2Session',
        'X-Twitter-Active-User': 'yes'
      };
      const variables = JSON.stringify({ screen_name: screenName, withSafetyModeUserFields: true });
      const features = JSON.stringify({
        hidden_profile_subscriptions_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: true,
        subscriptions_feature_can_gift_premium: true,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
      });
      const url = '/i/api/graphql/' + ${JSON.stringify(queryId)} + '/UserByScreenName?variables='
        + encodeURIComponent(variables) + '&features=' + encodeURIComponent(features);
      const resp = await fetch(url, {headers, credentials: 'include'});
      if (!resp.ok) return {error: 'HTTP ' + resp.status};
      const d = await resp.json();
      const r = d.data?.user?.result;
      if (!r?.rest_id) return {error: 'User @' + screenName + ' not found'};
      return { rest_id: r.rest_id };
    }
  `);
    if (result?.error) {
        if (String(result.error).includes('No ct0 cookie'))
            throw new AuthRequiredError('x.com', result.error);
        throw new CommandExecutionError(result.error);
    }
    return result.rest_id;
}

cli({
    site: 'twitter',
    name: 'user-tweets',
    description: "Fetch a Twitter user's tweet history (archives to SQLite, resumable)",
    domain: 'x.com',
    strategy: Strategy.COOKIE,
    browser: true,
    args: [
        { name: 'username', positional: true, type: 'string', required: true, help: 'Twitter screen name (without @).' },
        { name: 'limit', type: 'int', default: 0, help: 'Max tweets to return (0 = unlimited).' },
        { name: 'full', type: 'boolean', default: false, help: 'Ignore local watermark and re-fetch.' },
        { name: 'db', type: 'string', help: 'Override SQLite DB path.' },
    ],
    columns: ['id', 'author', 'text', 'created_at', 'url'],
    func: async (page, kwargs) => {
        const username = String(kwargs.username || '').replace(/^@/, '').trim();
        if (!username)
            throw new CommandExecutionError('username is required');
        const limit = kwargs.limit || 0;
        const full = !!kwargs.full;

        await page.goto(`https://x.com/${username}`);
        await page.wait(3);

        const ct0 = await page.evaluate(`() => {
            return document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('ct0='))?.split('=')[1] || null;
        }`);
        if (!ct0)
            throw new AuthRequiredError('x.com', 'Not logged into x.com (no ct0 cookie)');

        const userId = await resolveUserId(page, username);
        const queryId = await resolveTwitterQueryId(page, USER_TWEETS_OPERATION, USER_TWEETS_QUERY_ID_FALLBACK);

        const db = openTweetDb(kwargs.db);
        const maxSeenId = full ? null : db.getMaxIdForUser(username);

        const headers = JSON.stringify({
            'Authorization': `Bearer ${decodeURIComponent(BEARER_TOKEN)}`,
            'X-Csrf-Token': ct0,
            'X-Twitter-Auth-Type': 'OAuth2Session',
            'X-Twitter-Active-User': 'yes',
        });

        const allTweets = [];
        const seen = new Set();
        let cursor = null;
        let inserted = 0;
        let stopByWatermark = false;

        for (let round = 0; round < 200; round++) {
            const fetchCount = 40;
            const apiUrl = buildUserTweetsUrl(queryId, userId, fetchCount, cursor);
            const data = await page.evaluate(`async () => {
                const r = await fetch(${JSON.stringify(apiUrl)}, { headers: ${headers}, credentials: 'include' });
                return r.ok ? await r.json() : { error: r.status };
            }`);
            if (data?.error) {
                if (allTweets.length === 0)
                    throw new CommandExecutionError(`HTTP ${data.error}: Failed to fetch UserTweets. queryId may have expired or user may be protected.`);
                break;
            }
            const { tweets, nextCursor } = parseUserTweets(data, seen);
            if (tweets.length === 0 && !nextCursor)
                break;

            const rows = tweets.map(t => [t.id, username, t.text, t.created_at]);
            if (rows.length > 0)
                inserted += db.insertMany(rows).inserted;
            allTweets.push(...tweets);

            if (!full && maxSeenId && tweets.length > 0) {
                const allBelow = tweets.every(t => {
                    try { return BigInt(t.id) <= BigInt(maxSeenId); }
                    catch { return false; }
                });
                if (allBelow) {
                    stopByWatermark = true;
                    break;
                }
            }

            if (limit > 0 && allTweets.length >= limit)
                break;

            if (!nextCursor || nextCursor === cursor || tweets.length === 0)
                break;
            cursor = nextCursor;
        }

        const total = db.countForUser(username);
        db.close();

        process.stderr.write(`archived ${inserted} new tweets (${total} total in db) for @${username}${stopByWatermark ? ' [stopped at watermark]' : ''}\n`);

        return limit > 0 ? allTweets.slice(0, limit) : allTweets;
    },
});
