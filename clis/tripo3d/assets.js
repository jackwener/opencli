// tripo3d assets — list the projects in the signed-in workspace.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, EmptyResultError } from '@jackwener/opencli/errors';
import { HOST, api, ensureStudio, requireSession, workspaceUrl } from './utils.js';

const PAGE_SIZE = 20;
const MAX_LIMIT = 200;

cli({
    site: 'tripo3d',
    name: 'assets',
    description: 'List your Tripo projects with their ids, so texture has something to point at',
    access: 'read',
    example: 'opencli tripo3d assets --limit 10',
    domain: HOST,
    strategy: Strategy.INTERCEPT,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'limit', type: 'int', default: 20, help: `Projects to return, newest first (max ${MAX_LIMIT})` },
    ],
    columns: [
        'projectId',
        'projectName',
        'operatorId',
        'operatorType',
        'status',
        'isTextured',
        'isSmartMesh',
        'visibility',
        'createdAt',
        'workspaceUrl',
    ],
    func: async (page, args) => {
        const limit = Number(args.limit ?? 20);
        if (!Number.isInteger(limit) || limit <= 0) throw new ArgumentError('limit must be a positive integer');
        if (limit > MAX_LIMIT) throw new ArgumentError(`limit must be <= ${MAX_LIMIT}`);

        await ensureStudio(page);
        await requireSession(page);

        const projects = [];
        for (let offset = 0; projects.length < limit; offset += PAGE_SIZE) {
            const size = Math.min(PAGE_SIZE, limit - projects.length);
            const data = await api(page, `/v2/studio/assets/v2?asset_type=mine&offset=${offset}&size=${size}&type=all`, { method: 'GET' });
            const batch = Array.isArray(data?.projects) ? data.projects : [];
            projects.push(...batch);
            if (batch.length < size) break;
        }
        if (!projects.length) throw new EmptyResultError('tripo3d assets', 'this workspace has no projects yet');

        return projects.slice(0, limit).map((project) => {
            const op = project.operator || {};
            return {
                projectId: project.id ?? null,
                projectName: project.project_name ?? null,
                operatorId: op.operator_id ?? null,
                operatorType: op.type ?? null,
                status: op.status ?? null,
                isTextured: op.is_textured ?? null,
                // `is_nexus_mesh` is the site's own flag for a Smart Mesh model.
                isSmartMesh: op.is_nexus_mesh ?? null,
                visibility: project.visibility ?? null,
                createdAt: typeof op.created_at === 'number' ? new Date(op.created_at * 1000).toISOString() : null,
                workspaceUrl: project.id ? workspaceUrl(project.id) : null,
            };
        });
    },
});
