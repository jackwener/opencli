import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './marketplace-listings.js';
import './marketplace-inbox.js';
import './marketplace-reply.js';

function makePage(overrides = {}) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('facebook marketplace read commands', () => {
  it('marketplace-listings navigates to selling page and returns limited listing rows', async () => {
    const command = getRegistry().get('facebook/marketplace-listings');
    expect(command).toBeDefined();
    const page = makePage({
      evaluate: vi.fn().mockResolvedValue([
        { title: 'Black electric standing desk', price: 'CA$80', status: 'Active', listed: 'Listed on 4/26', clicks: '87', actions: ['Mark as sold', 'Share'] },
        { title: 'Large gray corduroy beanbag chair', price: 'CA$30', status: 'Sold', listed: 'Listed on 4/26', clicks: '52', actions: ['Mark as available', 'Relist this item'] },
      ]),
    });

    const rows = await command.func(page, { limit: 1 });

    expect(page.goto).toHaveBeenCalledWith('https://www.facebook.com/marketplace/you/selling/');
    expect(page.wait).toHaveBeenCalledWith(4);
    expect(rows).toEqual([
      {
        index: 1,
        title: 'Black electric standing desk',
        price: 'CA$80',
        status: 'Active',
        listed: 'Listed on 4/26',
        clicks: '87',
        actions: 'Mark as sold, Share',
      },
    ]);
  });

  it('marketplace-inbox navigates to inbox and returns recent buyer conversations', async () => {
    const command = getRegistry().get('facebook/marketplace-inbox');
    expect(command).toBeDefined();
    const page = makePage({
      evaluate: vi.fn().mockResolvedValue([
        { buyer: 'Kulwant', listing: 'White 3-tier rolling utility cart', snippet: 'Can I pick up today?', time: '3:43 PM', unread: true },
        { buyer: 'Gabriel', listing: 'Black electric standing desk', snippet: 'Yes, still available.', time: '12:17 PM', unread: false },
      ]),
    });

    const rows = await command.func(page, { limit: 2 });

    expect(page.goto).toHaveBeenCalledWith('https://www.facebook.com/marketplace/inbox/');
    expect(page.wait).toHaveBeenCalledWith(4);
    expect(rows).toEqual([
      { index: 1, buyer: 'Kulwant', listing: 'White 3-tier rolling utility cart', snippet: 'Can I pick up today?', time: '3:43 PM', unread: true },
      { index: 2, buyer: 'Gabriel', listing: 'Black electric standing desk', snippet: 'Yes, still available.', time: '12:17 PM', unread: false },
    ]);
  });

  it('throws a helpful auth/layout error when Marketplace returns no rows', async () => {
    const command = getRegistry().get('facebook/marketplace-inbox');
    const page = makePage({ evaluate: vi.fn().mockResolvedValue([]) });

    await expect(command.func(page, { limit: 5 })).rejects.toThrow('Could not find Facebook Marketplace inbox conversations');
  });
});

describe('facebook marketplace reply command', () => {
  it('drafts a reply by default and does not press Enter', async () => {
    const command = getRegistry().get('facebook/marketplace-reply');
    expect(command).toBeDefined();
    const page = makePage({
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true, label: 'Kulwant · White 3-tier rolling utility cart' })
        .mockResolvedValueOnce({ ok: true, aria: 'Write to Kulwant · White 3-tier rolling utility cart', draft: 'Yes still available' })
        .mockResolvedValueOnce({ textVisible: true, composerDrafts: ['Yes still available'], url: 'https://www.facebook.com/marketplace/inbox/' }),
      pressKey: vi.fn().mockResolvedValue(undefined),
    });

    const rows = await command.func(page, {
      text: 'Yes still available',
      buyer: 'Kulwant',
      listing: 'White 3-tier rolling utility cart',
    });

    expect(page.goto).toHaveBeenCalledWith('https://www.facebook.com/marketplace/inbox/');
    expect(page.pressKey).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ status: 'drafted', sent: false, buyer: 'Kulwant', verified: true });
  });

  it('requires --send true before pressing Enter to send', async () => {
    const command = getRegistry().get('facebook/marketplace-reply');
    const page = makePage({
      evaluate: vi.fn()
        .mockResolvedValueOnce({ ok: true, label: 'Gabriel · Black electric standing desk' })
        .mockResolvedValueOnce({ ok: true, aria: 'Write to Gabriel · Black electric standing desk', draft: 'Pickup today works' })
        .mockResolvedValueOnce({ textVisible: true, composerDrafts: [], url: 'https://www.facebook.com/marketplace/inbox/' }),
      pressKey: vi.fn().mockResolvedValue(undefined),
    });

    await command.func(page, {
      text: 'Pickup today works',
      buyer: 'Gabriel',
      listing: 'Black electric standing desk',
      send: 'true',
    });

    expect(page.pressKey).toHaveBeenCalledWith('Enter');
  });
});
