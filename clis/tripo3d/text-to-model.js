// tripo3d text-to-model — Smart Mesh: prompt in, topology-ready mesh out.
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
    TEXT_IMAGE_MODEL,
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
} from './utils.js';

const PROMPT_MAX = 1000;

cli({
    site: 'tripo3d',
    name: 'text-to-model',
    description: 'Smart Mesh: generate an untextured 3D mesh from a text prompt (spends Tripo credits)',
    access: 'write',
    example: 'opencli tripo3d text-to-model "a small stylized wooden treasure chest" --model p2 --topology quad --polycount 4000',
    domain: HOST,
    strategy: Strategy.INTERCEPT,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'prompt', type: 'string', required: true, positional: true, help: `What to build, up to ${PROMPT_MAX} characters` },
        { name: 'model', type: 'string', default: SMART_MESH_MODEL_DEFAULT, choices: SMART_MESH_MODELS, help: `Smart Mesh engine: p1 = "P1.0 - Fast" (${SMART_MESH_CREDITS.p1} credits, triangles only), p2 = "P2.0 - Preview" (${SMART_MESH_CREDITS.p2} credits, quad-capable)` },
        { name: 'topology', type: 'string', default: TOPOLOGY_DEFAULT, choices: TOPOLOGIES, help: 'Face topology (Topology setting); quad requires --model p2' },
        { name: 'polycount', type: 'int', default: POLYCOUNT_DEFAULT, help: POLYCOUNT_HELP },
        { name: 'visibility', type: 'string', default: VISIBILITY_DEFAULT, choices: VISIBILITY_CHOICES, help: 'Privacy of the new project; auto follows the studio (public on a free plan, shareable for subscribers) — private and shareable need a paid plan' },
        { name: 't-pose', type: 'bool', default: false, help: 'Ask for a T-posed character (characters only)' },
        { name: 'wait', type: 'bool', default: true, help: 'Wait for the mesh to finish before returning' },
        { name: 'timeout', type: 'int', default: 600, help: 'Seconds to wait when --wait is on' },
    ],
    columns: GENERATE_COLUMNS,
    func: async (page, args) => {
        const prompt = String(args.prompt ?? '').trim();
        if (!prompt) throw new ArgumentError('prompt is required and cannot be blank');
        if (prompt.length > PROMPT_MAX) {
            throw new ArgumentError(`prompt is ${prompt.length} characters; the studio accepts at most ${PROMPT_MAX}`);
        }

        const mesh = resolveSmartMesh(args);
        const timeoutSec = normalizeTimeout(args.timeout, 600);
        const wait = args.wait !== false;
        const tPose = args['t-pose'] === true;

        await ensureStudio(page);
        await requireSession(page);

        // Resolved against the account, so it has to wait for a live session.
        const visibility = await resolveVisibility(page, args.visibility);

        return runSmartMesh(page, {
            endpoint: '/v2/studio/operation/text_to_model',
            mode: 'text',
            // The studio renders a reference image first and lifts the mesh from
            // it; `sketch_to_render` is the line-art path, which Smart Mesh's
            // text tab never turns on.
            payload: {
                gen_image_model_version: TEXT_IMAGE_MODEL,
                prompt,
                sketch_to_render: false,
                t_pose: tPose,
            },
            ...mesh,
            visibility,
            // A prompt has no reference image, so P2's `symmetry` stays false —
            // the same literal the page posts from the text tab.
            symmetrySource: null,
            prompt,
            images: null,
            wait,
            timeoutSec,
        });
    },
});
