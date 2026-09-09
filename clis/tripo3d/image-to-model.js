// tripo3d image-to-model — Smart Mesh: one reference image in, mesh out.
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

cli({
    site: 'tripo3d',
    name: 'image-to-model',
    description: 'Smart Mesh: generate an untextured 3D mesh from one reference image (spends Tripo credits)',
    access: 'write',
    example: 'opencli tripo3d image-to-model ./chest.png --model p2 --topology quad --polycount 4000',
    domain: HOST,
    strategy: Strategy.INTERCEPT,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'image', type: 'string', required: true, positional: true, help: 'Local JPG/PNG/WEBP file, max 20MB' },
        { name: 'model', type: 'string', default: SMART_MESH_MODEL_DEFAULT, choices: SMART_MESH_MODELS, help: `Smart Mesh engine: p1 = "P1.0 - Fast" (${SMART_MESH_CREDITS.p1} credits, triangles only), p2 = "P2.0 - Preview" (${SMART_MESH_CREDITS.p2} credits, quad-capable)` },
        { name: 'topology', type: 'string', default: TOPOLOGY_DEFAULT, choices: TOPOLOGIES, help: 'Face topology (Topology setting); quad requires --model p2' },
        { name: 'polycount', type: 'int', default: POLYCOUNT_DEFAULT, help: POLYCOUNT_HELP },
        { name: 'visibility', type: 'string', default: VISIBILITY_DEFAULT, choices: VISIBILITY_CHOICES, help: 'Privacy of the new project; auto follows the studio (public on a free plan, shareable for subscribers) — private and shareable need a paid plan' },
        { name: 'wait', type: 'bool', default: true, help: 'Wait for the mesh to finish before returning' },
        { name: 'timeout', type: 'int', default: 600, help: 'Seconds to wait when --wait is on' },
    ],
    columns: GENERATE_COLUMNS,
    func: async (page, args) => {
        const imagePath = String(args.image ?? '').trim();
        if (!imagePath) throw new ArgumentError('image is required: pass the path to a local JPG/PNG/WEBP file');

        const mesh = resolveSmartMesh(args);
        const timeoutSec = normalizeTimeout(args.timeout, 600);
        const wait = args.wait !== false;

        await ensureStudio(page);
        await requireSession(page);

        // Resolved against the account, so it has to wait for a live session.
        const visibility = await resolveVisibility(page, args.visibility);

        const uploaded = await uploadImage(page, imagePath);

        return runSmartMesh(page, {
            endpoint: '/v2/studio/operation/image_to_model',
            mode: 'image',
            // `image_source` tells the studio this came from the upload box
            // rather than from its own image generator.
            payload: { image: { ...uploaded, image_source: 'upload' } },
            ...mesh,
            visibility,
            symmetrySource: uploaded,
            prompt: null,
            images: basename(imagePath),
            wait,
            timeoutSec,
        });
    },
});
