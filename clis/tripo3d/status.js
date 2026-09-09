// tripo3d status — check one or more Tripo tasks by operator id.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, EmptyResultError } from '@jackwener/opencli/errors';
import { HOST, api, ensureStudio, requireSession } from './utils.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

cli({
    site: 'tripo3d',
    name: 'status',
    description: 'Check Tripo generation tasks by operator id (the handle every generate/texture command returns)',
    access: 'read',
    example: 'opencli tripo3d status 7c3e5a18-90bd-42f6-b1c4-5de8073af921',
    domain: HOST,
    strategy: Strategy.INTERCEPT,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'operators', type: 'string', required: true, positional: true, help: 'Comma-separated operator ids' },
    ],
    columns: ['operatorId', 'status', 'progress', 'leftTime'],
    func: async (page, args) => {
        const ids = String(args.operators ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!ids.length) throw new ArgumentError('operators is required: pass one or more comma-separated operator ids');
        const bad = ids.find((id) => !UUID_RE.test(id));
        if (bad) throw new ArgumentError(`"${bad}" is not an operator id (expected a UUID)`);

        await ensureStudio(page);
        await requireSession(page);

        const rows = await api(page, '/v2/studio/progress', { body: { ids } });
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new EmptyResultError('tripo3d status', 'the studio knows none of these operator ids');
        }

        return rows.map((row) => ({
            operatorId: row.operator_id ?? row.id ?? null,
            status: row.status ?? null,
            progress: row.progress ?? null,
            // The site reports -1 once a task is no longer running.
            leftTime: typeof row.left_time === 'number' && row.left_time >= 0 ? row.left_time : null,
        }));
    },
});
