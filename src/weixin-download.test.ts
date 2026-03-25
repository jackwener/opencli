import { describe, expect, it } from 'vitest';

describe('weixin publish time extraction', () => {
  it('prefers publish_time text over create_time-like date strings', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '2026年3月24日 22:38',
      'var create_time = "2026年3月24日 22:38";',
    );

    expect(publishTime).toBe('2026年3月24日 22:38');
  });

  it('falls back to unix timestamp create_time values', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '',
      'var create_time = "1711291080";',
    );

    expect(publishTime).toBe('2024-03-24 22:38:00');
  });

  it('does not partially match localized create_time strings when DOM publish time is missing', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '',
      'var create_time = "2026年3月24日 22:38";',
    );

    expect(publishTime).toBe('');
  });

  it('accepts 13-digit millisecond timestamps only', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '',
      'var create_time = "1711291080000";',
    );

    expect(publishTime).toBe('2024-03-24 22:38:00');
  });

  it('rejects malformed 11-digit numeric create_time values', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '',
      'var create_time = "17112910800";',
    );

    expect(publishTime).toBe('');
  });

  it('rejects quoted timestamps with trailing garbage characters', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '',
      'var create_time = "1711291080abc";',
    );

    expect(publishTime).toBe('');
  });

  it('rejects bare timestamps with trailing garbage characters', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '',
      'var create_time = 1711291080abc;',
    );

    expect(publishTime).toBe('');
  });

  it('rejects garbage after a closed quoted timestamp', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '',
      'var create_time = "1711291080"abc;',
    );

    expect(publishTime).toBe('');
  });

  it('accepts single-quoted timestamps assigned with equals', async () => {
    const mod = await import('./clis/weixin/download.js');

    expect(typeof mod.extractWechatPublishTime).toBe('function');
    if (typeof mod.extractWechatPublishTime !== 'function') return;

    const publishTime = mod.extractWechatPublishTime(
      '',
      "var create_time = '1711291080';",
    );

    expect(publishTime).toBe('2024-03-24 22:38:00');
  });
});
