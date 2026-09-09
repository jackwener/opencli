// tripo3d texture — bake a texture onto a mesh that was already generated.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import {
    HOST,
    TEXTURE_ALIGNMENTS,
    TEXTURE_MODEL,
    TEXTURE_QUALITY_BY_SIZE,
    api,
    ensureStudio,
    normalizeTimeout,
    parseProjectId,
    requireSession,
    resolveChoice,
    waitForOperator,
    workspaceUrl,
} from './utils.js';

const SIZES = Object.keys(TEXTURE_QUALITY_BY_SIZE);

cli({
    site: 'tripo3d',
    name: 'texture',
    description: 'Generate a texture for an existing Tripo project mesh (spends Tripo credits)',
    access: 'write',
    example: 'opencli tripo3d texture 1f4b0c9a-6d21-4e5f-8a37-2c9de4b170aa --size 4k',
    domain: HOST,
    strategy: Strategy.INTERCEPT,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'project', type: 'string', required: true, positional: true, help: 'Project id, or a workspace URL' },
        { name: 'size', type: 'string', default: '2k', choices: SIZES, help: 'Texture resolution (4k and 8k cost extra credits)' },
        { name: 'alignment', type: 'string', default: 'original_image', choices: TEXTURE_ALIGNMENTS, help: 'Anchor the texture to the source image or to the bare geometry' },
        { name: 'prompt', type: 'string', default: '', help: 'Texture description; defaults to the prompt the mesh was generated with' },
        { name: 'wait', type: 'bool', default: true, help: 'Wait for the texture to finish before returning' },
        { name: 'timeout', type: 'int', default: 900, help: 'Seconds to wait when --wait is on' },
    ],
    columns: ['projectId', 'operatorId', 'status', 'progress', 'size', 'quality', 'alignment', 'prompt', 'workspaceUrl'],
    func: async (page, args) => {
        const projectId = parseProjectId(args.project);
        const size = resolveChoice(args.size, SIZES, 'size');
        const quality = TEXTURE_QUALITY_BY_SIZE[size];
        const alignment = resolveChoice(args.alignment, TEXTURE_ALIGNMENTS, 'alignment');
        const timeoutSec = normalizeTimeout(args.timeout, 900);
        const wait = args.wait !== false;
        const promptText = String(args.prompt ?? '').trim();

        await ensureStudio(page);
        await requireSession(page);

        const body = {
            model_version: TEXTURE_MODEL,
            project_id: projectId,
            texture_alignment: alignment,
            texture_quality: quality,
        };
        // The studio always sends a prompt; when the caller gives none it reuses
        // the text the mesh was generated from, so the texture matches the shape.
        if (promptText) body.prompt_text = promptText;

        const created = await api(page, '/v2/studio/operation/texture_model', { body });
        const operatorId = created?.operator_id || null;
        if (!operatorId) {
            throw new CommandExecutionError('texture_model accepted the request but returned no task handle');
        }

        let jobStatus = 'queued';
        let jobProgress = null;
        if (wait) {
            const done = await waitForOperator(page, operatorId, timeoutSec, 'texture generation');
            jobStatus = done.status;
            jobProgress = done.progress ?? null;
            if (jobStatus !== 'success') {
                throw new CommandExecutionError(
                    `texture generation ended as "${jobStatus}" (project ${projectId}, operator ${operatorId}) — open ${workspaceUrl(projectId)} for the site's own explanation`,
                );
            }
        }

        return [{
            projectId,
            operatorId,
            status: jobStatus,
            progress: jobProgress,
            size,
            quality,
            alignment,
            prompt: promptText || null,
            workspaceUrl: workspaceUrl(projectId),
        }];
    },
});
