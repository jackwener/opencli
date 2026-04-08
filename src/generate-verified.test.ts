import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import yaml from 'js-yaml';
import type { IPage } from './types.js';

const {
  mockExploreUrl,
  mockLoadExploreBundle,
  mockSynthesizeFromExplore,
  mockBrowserSession,
  mockCascadeProbe,
  mockExecutePipeline,
  mockRegisterCommand,
} = vi.hoisted(() => ({
  mockExploreUrl: vi.fn(),
  mockLoadExploreBundle: vi.fn(),
  mockSynthesizeFromExplore: vi.fn(),
  mockBrowserSession: vi.fn(),
  mockCascadeProbe: vi.fn(),
  mockExecutePipeline: vi.fn(),
  mockRegisterCommand: vi.fn(),
}));

vi.mock('./explore.js', () => ({
  exploreUrl: mockExploreUrl,
}));

vi.mock('./synthesize.js', () => ({
  loadExploreBundle: mockLoadExploreBundle,
  synthesizeFromExplore: mockSynthesizeFromExplore,
}));

vi.mock('./runtime.js', () => ({
  browserSession: mockBrowserSession,
}));

vi.mock('./cascade.js', () => ({
  cascadeProbe: mockCascadeProbe,
}));

vi.mock('./pipeline/index.js', () => ({
  executePipeline: mockExecutePipeline,
}));

vi.mock('./registry.js', async () => {
  const actual = await vi.importActual<typeof import('./registry.js')>('./registry.js');
  return {
    ...actual,
    registerCommand: mockRegisterCommand,
  };
});

vi.mock('./discovery.js', () => ({
  USER_CLIS_DIR: '/tmp/opencli-user-clis',
}));

import { Strategy } from './registry.js';
import { generateVerifiedFromUrl } from './generate-verified.js';

describe('generateVerifiedFromUrl', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-generate-verified-'));
    mockExploreUrl.mockReset();
    mockLoadExploreBundle.mockReset();
    mockSynthesizeFromExplore.mockReset();
    mockBrowserSession.mockReset();
    mockCascadeProbe.mockReset();
    mockExecutePipeline.mockReset();
    mockRegisterCommand.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns blocked when discover finds no API endpoints', async () => {
    mockExploreUrl.mockResolvedValue({
      site: 'demo',
      target_url: 'https://demo.test',
      final_url: 'https://demo.test',
      title: 'Demo',
      framework: {},
      stores: [],
      top_strategy: 'public',
      endpoint_count: 1,
      api_endpoint_count: 0,
      capabilities: [],
      auth_indicators: [],
      out_dir: tempDir,
    });
    mockLoadExploreBundle.mockReturnValue({
      manifest: { site: 'demo', target_url: 'https://demo.test', final_url: 'https://demo.test' },
      endpoints: [],
      capabilities: [],
    });
    mockSynthesizeFromExplore.mockReturnValue({
      site: 'demo',
      explore_dir: tempDir,
      out_dir: tempDir,
      candidate_count: 0,
      candidates: [],
    });

    const result = await generateVerifiedFromUrl({
      url: 'https://demo.test',
      BrowserFactory: class {} as never,
      noRegister: true,
    });

    expect(result).toEqual({
      version: 1,
      status: 'blocked',
      reason: 'no-api-discovered',
      stats: {
        endpoint_count: 1,
        api_endpoint_count: 0,
        candidate_count: 0,
        verified: false,
        repair_attempted: false,
        explore_dir: tempDir,
      },
    });
    expect(mockBrowserSession).not.toHaveBeenCalled();
  });

  it('verifies the selected candidate in a single session and registers on success', async () => {
    const hotPath = path.join(tempDir, 'hot.yaml');
    const searchPath = path.join(tempDir, 'search.yaml');

    fs.writeFileSync(hotPath, yaml.dump({
      site: 'demo',
      name: 'hot',
      description: 'demo hot',
      domain: 'demo.test',
      strategy: 'public',
      browser: false,
      args: {
        limit: { type: 'int', default: 20 },
      },
      columns: ['title', 'url'],
      pipeline: [
        { fetch: { url: 'https://demo.test/api/hot?limit=${{ args.limit | default(20) }}' } },
        { select: 'data.items' },
        { map: { rank: '${{ index + 1 }}', title: '${{ item.title }}', url: '${{ item.url }}' } },
        { limit: '${{ args.limit | default(20) }}' },
      ],
    }, { sortKeys: false }));

    fs.writeFileSync(searchPath, yaml.dump({
      site: 'demo',
      name: 'search',
      description: 'demo search',
      domain: 'demo.test',
      strategy: 'public',
      browser: false,
      args: {
        keyword: { type: 'str', required: true },
      },
      columns: ['title', 'url'],
      pipeline: [
        { fetch: { url: 'https://demo.test/api/search?q=${{ args.keyword }}' } },
        { select: 'payload.items' },
        { map: { title: '${{ item.title }}', url: '${{ item.url }}' } },
      ],
    }, { sortKeys: false }));

    mockExploreUrl.mockResolvedValue({
      site: 'demo',
      target_url: 'https://demo.test',
      final_url: 'https://demo.test/home',
      title: 'Demo',
      framework: {},
      stores: [],
      top_strategy: 'cookie',
      endpoint_count: 2,
      api_endpoint_count: 2,
      capabilities: [{ name: 'hot' }, { name: 'search' }],
      auth_indicators: [],
      out_dir: tempDir,
    });
    mockLoadExploreBundle.mockReturnValue({
      manifest: { site: 'demo', target_url: 'https://demo.test', final_url: 'https://demo.test/home' },
      endpoints: [
        {
          pattern: 'demo.test/api/hot',
          url: 'https://demo.test/api/hot?limit=20',
          itemPath: 'data.items',
          itemCount: 5,
          detectedFields: { title: 'title', url: 'url' },
        },
        {
          pattern: 'demo.test/api/search',
          url: 'https://demo.test/api/search?q=test',
          itemPath: 'payload.items',
          itemCount: 10,
          detectedFields: { title: 'headline', url: 'permalink' },
        },
      ],
      capabilities: [
        { name: 'hot', strategy: 'public', endpoint: 'demo.test/api/hot', itemPath: 'data.items' },
        { name: 'search', strategy: 'cookie', endpoint: 'demo.test/api/search', itemPath: 'payload.items' },
      ],
    });
    mockSynthesizeFromExplore.mockReturnValue({
      site: 'demo',
      explore_dir: tempDir,
      out_dir: tempDir,
      candidate_count: 2,
      candidates: [
        { name: 'hot', path: hotPath, strategy: 'public' },
        { name: 'search', path: searchPath, strategy: 'public' },
      ],
    });

    const page = { goto: vi.fn() } as unknown as IPage;
    mockBrowserSession.mockImplementation(async (_factory, fn) => fn(page));
    mockCascadeProbe.mockResolvedValue({
      bestStrategy: Strategy.COOKIE,
      probes: [
        { strategy: Strategy.PUBLIC, success: false },
        { strategy: Strategy.COOKIE, success: true },
      ],
      confidence: 0.9,
    });
    mockExecutePipeline.mockResolvedValue([{ title: 'hello', url: 'https://demo.test/item/1' }]);

    const result = await generateVerifiedFromUrl({
      url: 'https://demo.test',
      BrowserFactory: class {} as never,
      goal: 'search',
      noRegister: false,
    });

    expect(mockBrowserSession).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith('https://demo.test/home');
    expect(mockCascadeProbe).toHaveBeenCalledWith(page, 'https://demo.test/api/search?q=test', { maxStrategy: Strategy.COOKIE });
    expect(mockExecutePipeline).toHaveBeenCalledTimes(1);
    expect(mockExecutePipeline).toHaveBeenCalledWith(
      page,
      expect.any(Array),
      expect.objectContaining({
        args: expect.objectContaining({ keyword: 'test' }),
      }),
    );
    expect(mockRegisterCommand).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      version: 1,
      status: 'success',
      adapter: expect.objectContaining({
        command: 'demo/search',
        strategy: Strategy.COOKIE,
      }),
      stats: expect.objectContaining({
        candidate_count: 2,
        verified: true,
        repair_attempted: false,
      }),
    }));
  });

  it('writes a verified artifact for --no-register success instead of returning the original candidate path', async () => {
    const candidatePath = path.join(tempDir, 'search.yaml');
    fs.writeFileSync(candidatePath, yaml.dump({
      site: 'demo',
      name: 'search',
      description: 'demo search',
      domain: 'demo.test',
      strategy: 'public',
      browser: false,
      args: {
        keyword: { type: 'str', required: true },
      },
      columns: ['title', 'url'],
      pipeline: [
        { fetch: { url: 'https://demo.test/api/search?q=${{ args.keyword }}' } },
        { select: 'payload.items' },
        { map: { title: '${{ item.title }}', url: '${{ item.url }}' } },
      ],
    }, { sortKeys: false }));

    mockExploreUrl.mockResolvedValue({
      site: 'demo',
      target_url: 'https://demo.test',
      final_url: 'https://demo.test/home',
      title: 'Demo',
      framework: {},
      stores: [],
      top_strategy: 'cookie',
      endpoint_count: 1,
      api_endpoint_count: 1,
      capabilities: [{ name: 'search' }],
      auth_indicators: [],
      out_dir: tempDir,
    });
    mockLoadExploreBundle.mockReturnValue({
      manifest: { site: 'demo', target_url: 'https://demo.test', final_url: 'https://demo.test/home' },
      endpoints: [{
        pattern: 'demo.test/api/search',
        url: 'https://demo.test/api/search?q=test',
        itemPath: 'payload.items',
        itemCount: 10,
        detectedFields: { title: 'headline', url: 'permalink' },
      }],
      capabilities: [{ name: 'search', strategy: 'cookie', endpoint: 'demo.test/api/search', itemPath: 'payload.items' }],
    });
    mockSynthesizeFromExplore.mockReturnValue({
      site: 'demo',
      explore_dir: tempDir,
      out_dir: tempDir,
      candidate_count: 1,
      candidates: [{ name: 'search', path: candidatePath, strategy: 'public' }],
    });

    const page = { goto: vi.fn() } as unknown as IPage;
    mockBrowserSession.mockImplementation(async (_factory, fn) => fn(page));
    mockCascadeProbe.mockResolvedValue({
      bestStrategy: Strategy.COOKIE,
      probes: [
        { strategy: Strategy.PUBLIC, success: false },
        { strategy: Strategy.COOKIE, success: true },
      ],
      confidence: 0.9,
    });
    mockExecutePipeline.mockResolvedValue([{ title: 'hello', url: 'https://demo.test/item/1' }]);

    const result = await generateVerifiedFromUrl({
      url: 'https://demo.test',
      BrowserFactory: class {} as never,
      goal: 'search',
      noRegister: true,
    });

    expect(result.status).toBe('success');
    expect(result.adapter?.path).toMatch(/verified\/search\.verified\.yaml$/);
    expect(result.adapter?.path).not.toBe(candidatePath);
    expect(fs.existsSync(result.adapter!.path)).toBe(true);
    expect(mockRegisterCommand).not.toHaveBeenCalled();
  });

  it('attempts a single itemPath repair on empty-result and returns needs-human-check when it still fails', async () => {
    const candidatePath = path.join(tempDir, 'hot.yaml');
    fs.writeFileSync(candidatePath, yaml.dump({
      site: 'demo',
      name: 'hot',
      description: 'demo hot',
      domain: 'demo.test',
      strategy: 'public',
      browser: false,
      args: {
        limit: { type: 'int', default: 20 },
      },
      columns: ['title', 'url'],
      pipeline: [
        { fetch: { url: 'https://demo.test/api/hot?limit=${{ args.limit | default(20) }}' } },
        { select: 'wrong.items' },
        { map: { rank: '${{ index + 1 }}', title: '${{ item.title }}', url: '${{ item.url }}' } },
        { limit: '${{ args.limit | default(20) }}' },
      ],
    }, { sortKeys: false }));

    mockExploreUrl.mockResolvedValue({
      site: 'demo',
      target_url: 'https://demo.test',
      final_url: 'https://demo.test',
      title: 'Demo',
      framework: {},
      stores: [],
      top_strategy: 'public',
      endpoint_count: 1,
      api_endpoint_count: 1,
      capabilities: [{ name: 'hot' }],
      auth_indicators: [],
      out_dir: tempDir,
    });
    mockLoadExploreBundle.mockReturnValue({
      manifest: { site: 'demo', target_url: 'https://demo.test', final_url: 'https://demo.test' },
      endpoints: [{
        pattern: 'demo.test/api/hot',
        url: 'https://demo.test/api/hot?limit=20',
        itemPath: 'data.items',
        itemCount: 5,
        detectedFields: { title: 'title', url: 'url' },
      }],
      capabilities: [{ name: 'hot', strategy: 'public', endpoint: 'demo.test/api/hot', itemPath: 'data.items' }],
    });
    mockSynthesizeFromExplore.mockReturnValue({
      site: 'demo',
      explore_dir: tempDir,
      out_dir: tempDir,
      candidate_count: 1,
      candidates: [{ name: 'hot', path: candidatePath, strategy: 'public' }],
    });

    const page = { goto: vi.fn() } as unknown as IPage;
    mockBrowserSession.mockImplementation(async (_factory, fn) => fn(page));
    mockCascadeProbe.mockResolvedValue({
      bestStrategy: Strategy.PUBLIC,
      probes: [{ strategy: Strategy.PUBLIC, success: true }],
      confidence: 1,
    });
    mockExecutePipeline.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await generateVerifiedFromUrl({
      url: 'https://demo.test',
      BrowserFactory: class {} as never,
      noRegister: true,
    });

    expect(mockExecutePipeline).toHaveBeenCalledTimes(2);
    expect(mockExecutePipeline.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([{ select: 'wrong.items' }]));
    expect(mockExecutePipeline.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([{ select: 'data.items' }]));
    expect(result).toEqual(expect.objectContaining({
      version: 1,
      status: 'needs-human-check',
      issue: 'empty-result',
      stats: expect.objectContaining({
        repair_attempted: true,
        verified: false,
      }),
    }));
  });

  it('returns blocked when no PUBLIC/COOKIE probe succeeds', async () => {
    const candidatePath = path.join(tempDir, 'hot.yaml');
    fs.writeFileSync(candidatePath, yaml.dump({
      site: 'demo',
      name: 'hot',
      description: 'demo hot',
      domain: 'demo.test',
      strategy: 'public',
      browser: false,
      args: {},
      columns: ['title', 'url'],
      pipeline: [
        { fetch: { url: 'https://demo.test/api/hot' } },
        { select: 'data.items' },
      ],
    }, { sortKeys: false }));

    mockExploreUrl.mockResolvedValue({
      site: 'demo',
      target_url: 'https://demo.test',
      final_url: 'https://demo.test',
      title: 'Demo',
      framework: {},
      stores: [],
      top_strategy: 'cookie',
      endpoint_count: 1,
      api_endpoint_count: 1,
      capabilities: [{ name: 'hot' }],
      auth_indicators: [],
      out_dir: tempDir,
    });
    mockLoadExploreBundle.mockReturnValue({
      manifest: { site: 'demo', target_url: 'https://demo.test', final_url: 'https://demo.test' },
      endpoints: [{
        pattern: 'demo.test/api/hot',
        url: 'https://demo.test/api/hot',
        itemPath: 'data.items',
        itemCount: 5,
        detectedFields: { title: 'title', url: 'url' },
      }],
      capabilities: [{ name: 'hot', strategy: 'cookie', endpoint: 'demo.test/api/hot', itemPath: 'data.items' }],
    });
    mockSynthesizeFromExplore.mockReturnValue({
      site: 'demo',
      explore_dir: tempDir,
      out_dir: tempDir,
      candidate_count: 1,
      candidates: [{ name: 'hot', path: candidatePath, strategy: 'public' }],
    });

    const page = { goto: vi.fn() } as unknown as IPage;
    mockBrowserSession.mockImplementation(async (_factory, fn) => fn(page));
    mockCascadeProbe.mockResolvedValue({
      bestStrategy: Strategy.COOKIE,
      probes: [
        { strategy: Strategy.PUBLIC, success: false },
        { strategy: Strategy.COOKIE, success: false },
      ],
      confidence: 0.3,
    });

    const result = await generateVerifiedFromUrl({
      url: 'https://demo.test',
      BrowserFactory: class {} as never,
      noRegister: true,
    });

    expect(mockExecutePipeline).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      version: 1,
      status: 'blocked',
      reason: 'auth-required',
    }));
  });

  it('narrows v1 scope by sending unsupported required args to needs-human-check', async () => {
    const candidatePath = path.join(tempDir, 'detail.yaml');
    fs.writeFileSync(candidatePath, yaml.dump({
      site: 'demo',
      name: 'detail',
      description: 'demo detail',
      domain: 'demo.test',
      strategy: 'public',
      browser: false,
      args: {
        id: { type: 'str', required: true },
      },
      columns: ['title', 'url'],
      pipeline: [
        { fetch: { url: 'https://demo.test/api/detail?id=${{ args.id }}' } },
        { select: 'data.item' },
      ],
    }, { sortKeys: false }));

    mockExploreUrl.mockResolvedValue({
      site: 'demo',
      target_url: 'https://demo.test/detail/123',
      final_url: 'https://demo.test/detail/123',
      title: 'Demo detail',
      framework: {},
      stores: [],
      top_strategy: 'public',
      endpoint_count: 1,
      api_endpoint_count: 1,
      capabilities: [{ name: 'detail' }],
      auth_indicators: [],
      out_dir: tempDir,
    });
    mockLoadExploreBundle.mockReturnValue({
      manifest: { site: 'demo', target_url: 'https://demo.test/detail/123', final_url: 'https://demo.test/detail/123' },
      endpoints: [{
        pattern: 'demo.test/api/detail',
        url: 'https://demo.test/api/detail?id=123',
        itemPath: 'data.item',
        itemCount: 1,
        detectedFields: { title: 'title', url: 'url' },
      }],
      capabilities: [{ name: 'detail', strategy: 'public', endpoint: 'demo.test/api/detail', itemPath: 'data.item' }],
    });
    mockSynthesizeFromExplore.mockReturnValue({
      site: 'demo',
      explore_dir: tempDir,
      out_dir: tempDir,
      candidate_count: 1,
      candidates: [{ name: 'detail', path: candidatePath, strategy: 'public' }],
    });

    const result = await generateVerifiedFromUrl({
      url: 'https://demo.test/detail/123',
      BrowserFactory: class {} as never,
      goal: 'detail',
      noRegister: true,
    });

    expect(mockBrowserSession).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      version: 1,
      status: 'needs-human-check',
      issue: expect.stringContaining('required args: id'),
    }));
  });
});
