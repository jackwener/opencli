import { describe, expect, it } from 'vitest';
import { __test__ } from './download.js';

describe('xiaohongshu download media normalization', () => {
  it('replaces blob video urls with real media urls from performance resources', () => {
    const media = __test__.normalizeXhsMedia([
      { type: 'video', url: 'blob:https://www.xiaohongshu.com/abc' },
      { type: 'image', url: 'https://ci.xiaohongshu.com/image.jpg' },
    ], [
      'https://sns-video-hw.xhscdn.com/stream/1/110/130/example_130.mp4?sign=abc&t=123',
      'https://www.xiaohongshu.com/some-script.js',
    ]);

    expect(media).toEqual([
      {
        type: 'video',
        url: 'https://sns-video-hw.xhscdn.com/stream/1/110/130/example_130.mp4?sign=abc&t=123',
      },
      {
        type: 'image',
        url: 'https://ci.xiaohongshu.com/image.jpg',
      },
    ]);
  });

  it('keeps direct video urls unchanged', () => {
    const media = __test__.normalizeXhsMedia([
      { type: 'video', url: 'https://sns-video-hw.xhscdn.com/direct.mp4' },
    ], [
      'https://sns-video-hw.xhscdn.com/stream/1/110/130/other.mp4',
    ]);

    expect(media).toEqual([
      { type: 'video', url: 'https://sns-video-hw.xhscdn.com/direct.mp4' },
    ]);
  });
});
