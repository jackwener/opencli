import { afterAll, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { getRegistry } from '@jackwener/opencli/registry';
import './user-tweets.js';
import { openTweetDb } from './db.js';

describe('twitter user-tweets registration', () => {
    it('registers the user-tweets command with the expected shape', () => {
        const cmd = getRegistry().get('twitter/user-tweets');
        expect(cmd?.func).toBeTypeOf('function');
        expect(cmd?.name).toBe('user-tweets');

        const usernameArg = cmd?.args?.find((a) => a.name === 'username');
        expect(usernameArg).toBeTruthy();
        expect(usernameArg?.positional).toBe(true);
        expect(usernameArg?.required).toBe(true);

        expect(cmd?.args?.find((a) => a.name === 'limit')).toBeTruthy();
        expect(cmd?.args?.find((a) => a.name === 'full')).toBeTruthy();
        expect(cmd?.args?.find((a) => a.name === 'db')).toBeTruthy();

        for (const col of ['id', 'author', 'text', 'created_at', 'url']) {
            expect(cmd?.columns).toContain(col);
        }
    });
});

describe('twitter user-tweets db layer', () => {
    const dbPath = path.join(os.tmpdir(), `opencli-twitter-user-tweets-test-${process.pid}-${Date.now()}.db`);
    const db = openTweetDb(dbPath);

    afterAll(() => {
        try { db.close?.(); } catch {}
        try { fs.unlinkSync(dbPath); } catch {}
    });

    it('insertMany + getMaxIdForUser returns highest snowflake id (BigInt-safe)', () => {
        const rows = [
            ['1700000000000000000', 'alice', 'hello',  '2024-01-01T00:00:00Z'],
            ['1800000000000000000', 'alice', 'world',  '2024-02-01T00:00:00Z'],
            ['1750000000000000000', 'alice', 'middle', '2024-01-15T00:00:00Z'],
        ];
        const r = db.insertMany(rows);
        expect(r.inserted).toBe(3);
        expect(db.getMaxIdForUser('alice')).toBe('1800000000000000000');
    });

    it('INSERT OR IGNORE dedups and countForUser is accurate', () => {
        const overlapping = [
            ['1800000000000000000', 'alice', 'world dup', '2024-02-01T00:00:00Z'],
            ['1900000000000000000', 'alice', 'newer',     '2024-03-01T00:00:00Z'],
        ];
        const r = db.insertMany(overlapping);
        expect(r.inserted).toBe(1);
        expect(db.countForUser('alice')).toBe(4);
        expect(db.getMaxIdForUser('alice')).toBe('1900000000000000000');
    });

    it('getMaxIdForUser returns null for unknown user', () => {
        expect(db.getMaxIdForUser('nobody-here')).toBeNull();
        expect(db.countForUser('nobody-here')).toBe(0);
    });
});
