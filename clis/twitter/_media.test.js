import { describe, expect, it } from 'vitest';
import { extractMedia } from './_media.js';

describe('twitter _media.extractMedia', () => {
    it('returns undefined when legacy has no media', () => {
        expect(extractMedia(undefined)).toBeUndefined();
        expect(extractMedia({})).toBeUndefined();
        expect(extractMedia({ entities: {} })).toBeUndefined();
        expect(extractMedia({ entities: { media: [] } })).toBeUndefined();
    });

    it('extracts photos from extended_entities and normalizes URL with name=large', () => {
        const legacy = {
            extended_entities: {
                media: [
                    { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/ABC.jpg' },
                    { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/DEF?format=png&name=small' },
                ],
            },
        };
        expect(extractMedia(legacy)).toEqual([
            { type: 'photo', url: 'https://pbs.twimg.com/media/ABC?format=jpg&name=large' },
            { type: 'photo', url: 'https://pbs.twimg.com/media/DEF?format=png&name=large' },
        ]);
    });

    it('falls back to entities.media when extended_entities is absent', () => {
        const legacy = {
            entities: {
                media: [{ type: 'photo', media_url_https: 'https://pbs.twimg.com/media/X.jpg' }],
            },
        };
        expect(extractMedia(legacy)).toEqual([
            { type: 'photo', url: 'https://pbs.twimg.com/media/X?format=jpg&name=large' },
        ]);
    });

    it('picks the highest-bitrate mp4 variant for videos and surfaces the poster', () => {
        const legacy = {
            extended_entities: {
                media: [{
                    type: 'video',
                    media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/1/img.jpg',
                    video_info: {
                        variants: [
                            { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/.../master.m3u8' },
                            { content_type: 'video/mp4', bitrate: 320000, url: 'https://video.twimg.com/.../low.mp4' },
                            { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/.../high.mp4' },
                            { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/.../mid.mp4' },
                        ],
                    },
                }],
            },
        };
        expect(extractMedia(legacy)).toEqual([{
            type: 'video',
            url: 'https://video.twimg.com/.../high.mp4',
            poster: 'https://pbs.twimg.com/amplify_video_thumb/1/img.jpg',
        }]);
    });

    it('handles animated_gif (single mp4 variant + poster)', () => {
        const legacy = {
            extended_entities: {
                media: [{
                    type: 'animated_gif',
                    media_url_https: 'https://pbs.twimg.com/tweet_video_thumb/G.jpg',
                    video_info: {
                        variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/.../gif.mp4' }],
                    },
                }],
            },
        };
        expect(extractMedia(legacy)).toEqual([{
            type: 'animated_gif',
            url: 'https://video.twimg.com/.../gif.mp4',
            poster: 'https://pbs.twimg.com/tweet_video_thumb/G.jpg',
        }]);
    });

    it('skips entries with unknown types and unparseable shapes', () => {
        const legacy = {
            extended_entities: {
                media: [
                    { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/A.jpg' },
                    { type: 'unsupported_card_thing' },
                    null,
                    { type: 'video' /* no video_info */ },
                ],
            },
        };
        expect(extractMedia(legacy)).toEqual([
            { type: 'photo', url: 'https://pbs.twimg.com/media/A?format=jpg&name=large' },
        ]);
    });

    it('returns undefined when nothing normalizes successfully', () => {
        const legacy = {
            extended_entities: { media: [{ type: 'unknown' }, null] },
        };
        expect(extractMedia(legacy)).toBeUndefined();
    });
});
