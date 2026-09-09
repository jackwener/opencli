// tripo3d multiview-to-model — Smart Mesh: up to four orthographic views in, mesh out.
import { basename } from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import {
    GENERATE_COLUMNS,
    HOST,
    POLYCOUNT_DEFAULT,
    POLYCOUNT_HELP,
    SMART_MESH_CREDITS,
    SMART_MESH_MODELS,
    SMART_MESH_MODEL_DEFAULT,
    TOPOLOGIES,
    TOPOLOGY_DEFAULT,
    VISIBILITY_CHOICES,
    VISIBILITY_DEFAULT,
    ensureStudio,
    normalizeTimeout,
    requireSession,
    resolveVisibility,
    resolveSmartMesh,
    runSmartMesh,
    uploadImage,
} from './utils.js';

/**
 * Slot order is positional and fixed: the endpoint always receives a four-entry
 * array in this order, with `null` standing in for a view the caller skipped.
 * Reordering it would silently model the object back-to-front.
 */
const VIEW_SLOTS = ['front', 'left', 'back', 'right'];

cli({
    site: 'tripo3d',
    name: 'multiview-to-model',
    description: 'Smart Mesh: generate an untextured 3D mesh from front/left/back/right views (spends Tripo credits)',
    access: 'write',
    example: 'opencli tripo3d multiview-to-model ./front.png --left ./left.png --back ./back.png',
    domain: HOST,
    strategy: Strategy.INTERCEPT,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'front', type: 'string', required: true, positional: true, help: 'Front view — the only required slot' },
        { name: 'left', type: 'string', default: '', help: 'Left view (optional)' },
        { name: 'back', type: 'string', default: '', help: 'Back view (optional)' },
        { name: 'right', type: 'string', default: '', help: 'Right view (optional)' },
        { name: 'model', type: 'string', default: SMART_MESH_MODEL_DEFAULT, choices: SMART_MESH_MODELS, help: `Smart Mesh engine: p1 = "P1.0 - Fast" (${SMART_MESH_CREDITS.p1} credits, triangles only), p2 = "P2.0 - Preview" (${SMART_MESH_CREDITS.p2} credits, quad-capable)` },
        { name: 'topology', type: 'string', default: TOPOLOGY_DEFAULT, choices: TOPOLOGIES, help: 'Face topology (Topology setting); quad requires --model p2' },
        { name: 'polycount', type: 'int', default: POLYCOUNT_DEFAULT, help: POLYCOUNT_HELP },
        { name: 'visibility', type: 'string', default: VISIBILITY_DEFAULT, choices: VISIBILITY_CHOICES, help: 'Privacy of the new project; auto follows the studio (public on a free plan, shareable for subscribers) — private and shareable need a paid plan' },
        { name: 'wait', type: 'bool', default: true, help: 'Wait for the mesh to finish before returning' },
        { name: 'timeout', type: 'int', default: 600, help: 'Seconds to wait when --wait is on' },
    ],
    columns: GENERATE_COLUMNS,
    func: async (page, args) => {
        const paths = VIEW_SLOTS.map((slot) => String(args[slot] ?? '').trim() || null);
        if (!paths[0]) throw new ArgumentError('front is required: pass the path to the front view');

        const mesh = resolveSmartMesh(args);
        const timeoutSec = normalizeTimeout(args.timeout, 600);
        const wait = args.wait !== false;

        await ensureStudio(page);
        await requireSession(page);

        // Resolved against the account, so it has to wait for a live session.
        const visibility = await resolveVisibility(page, args.visibility);

        // Upload every view before submitting: a bad path halfway through would
        // otherwise leave orphaned uploads and no job.
        const slots = [];
        for (const path of paths) {
            slots.push(path ? await uploadImage(page, path) : null);
        }

        return runSmartMesh(page, {
            endpoint: '/v2/studio/operation/multiview_to_model',
            mode: 'multiview',
            payload: { image: slots },
            ...mesh,
            visibility,
            // The page checks symmetry on the "main view", which starts at slot 0
            // and only moves when a human clicks another thumbnail — so front.
            symmetrySource: slots[0],
            prompt: null,
            images: paths.map((p, i) => (p ? `${VIEW_SLOTS[i]}=${basename(p)}` : null)).filter(Boolean).join(', '),
            wait,
            timeoutSec,
        });
    },
});
