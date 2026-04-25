import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './profile.js';

describe('google-scholar profile command', () => {
    const command = getRegistry().get('google-scholar/profile');

    it('registers as a public browser command', () => {
        expect(command).toBeDefined();
        expect(command.site).toBe('google-scholar');
        expect(command.strategy).toBe('public');
        expect(command.browser).toBe(true);
    });

    it('rejects empty author before browser navigation', async () => {
        const page = { goto: vi.fn() };
        await expect(command.func(page, { author: '   ' })).rejects.toMatchObject({
            name: 'ArgumentError',
            code: 'ARGUMENT',
        });
        expect(page.goto).not.toHaveBeenCalled();
    });
});
