import { describe, expect, it } from 'vitest';
import type { IPage } from '../../types.js';
import { __test__ } from './ask.js';

describe('yuanbao ask helpers', () => {
  describe('isOnYuanbao', () => {
    const fakePage = (url: string | Error): IPage =>
      ({ evaluate: () => url instanceof Error ? Promise.reject(url) : Promise.resolve(url) }) as unknown as IPage;

    it('returns true for yuanbao.tencent.com URLs', async () => {
      expect(await __test__.isOnYuanbao(fakePage('https://yuanbao.tencent.com/'))).toBe(true);
      expect(await __test__.isOnYuanbao(fakePage('https://yuanbao.tencent.com/chat/abc'))).toBe(true);
    });

    it('returns false for non-yuanbao domains', async () => {
      expect(await __test__.isOnYuanbao(fakePage('https://example.com/?next=yuanbao.tencent.com'))).toBe(false);
      expect(await __test__.isOnYuanbao(fakePage('about:blank'))).toBe(false);
    });

    it('returns false when evaluate throws', async () => {
      expect(await __test__.isOnYuanbao(fakePage(new Error('detached')))).toBe(false);
    });
  });

  it('removes echoed prompt prefixes from transcript additions', () => {
    expect(__test__.sanitizeYuanbaoResponseText('你好\n你好，我是元宝。', '你好')).toBe('你好，我是元宝。');
  });

  it('filters transient in-progress assistant placeholders', () => {
    expect(__test__.sanitizeYuanbaoResponseText('正在搜索资料', '张雪机车相关的股票有哪些？')).toBe('');
  });

  it('normalizes boolean flags with explicit defaults', () => {
    expect(__test__.normalizeBooleanFlag(undefined, true)).toBe(true);
    expect(__test__.normalizeBooleanFlag(undefined, false)).toBe(false);
    expect(__test__.normalizeBooleanFlag('true', false)).toBe(true);
    expect(__test__.normalizeBooleanFlag('1', false)).toBe(true);
    expect(__test__.normalizeBooleanFlag('yes', false)).toBe(true);
    expect(__test__.normalizeBooleanFlag('false', true)).toBe(false);
  });

  it('ignores baseline lines and echoed prompts when collecting additions', () => {
    const response = __test__.collectYuanbaoTranscriptAdditions(
      ['旧消息'],
      ['旧消息', '你好', '你好\n你好，我是元宝。'],
      '你好',
    );

    expect(response).toBe('你好，我是元宝。');
  });

  it('prefers fresh assistant messages over echoed prompts and older messages', () => {
    const response = __test__.pickLatestYuanbaoAssistantCandidate(
      ['旧回复', '你好', '你好！我是元宝，由腾讯推出的AI助手。'],
      1,
      '你好',
    );

    expect(response).toBe('你好！我是元宝，由腾讯推出的AI助手。');
  });

  it('converts assistant html tables to markdown tables via turndown', () => {
    const markdown = __test__.convertYuanbaoHtmlToMarkdown(`
      <h3>核心产业链概念股一览</h3>
      <table>
        <thead>
          <tr><th>细分赛道</th><th>核心标的</th></tr>
        </thead>
        <tbody>
          <tr><td>光模块</td><td>中际旭创</td></tr>
        </tbody>
      </table>
    `);

    expect(markdown).toContain('### 核心产业链概念股一览');
    expect(markdown).toContain('| 细分赛道 | 核心标的 |');
    expect(markdown).toContain('| --- | --- |');
    expect(markdown).toContain('| 光模块 | 中际旭创 |');
  });

  it('tracks stabilization by incrementing repeats and resetting on changes', () => {
    expect(__test__.updateStableState('', 0, '第一段')).toEqual({
      previousText: '第一段',
      stableCount: 0,
    });

    expect(__test__.updateStableState('第一段', 0, '第一段')).toEqual({
      previousText: '第一段',
      stableCount: 1,
    });

    expect(__test__.updateStableState('第一段', 1, '第二段')).toEqual({
      previousText: '第二段',
      stableCount: 0,
    });
  });
});
