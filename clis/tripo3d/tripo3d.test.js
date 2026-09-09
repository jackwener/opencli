import { describe, expect, it } from 'vitest';
import { getRegistry, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
    POLYCOUNT_MAX,
    SMART_MESH_MODEL_VERSIONS,
    api,
    normalizePolycount,
    parseProjectId,
    resolveChoice,
    resolveSmartMesh,
    resolveSymmetry,
    resolveVisibility,
    runSmartMesh,
} from './utils.js';
import './text-to-model.js';
import './image-to-model.js';
import './multiview-to-model.js';
import './texture.js';
import './status.js';
import './assets.js';
import './credits.js';

/**
 * Stand-in for the browser page.
 *
 * `api()` builds a page-context fetch as a source string with the endpoint path
 * embedded, so routing on that substring is enough to drive every helper without
 * a real browser. Every call is recorded so a test can assert on the request the
 * adapter would actually have sent.
 */
function fakePage(routes) {
    const calls = [];
    return {
        calls,
        async evaluate(src) {
            const path = Object.keys(routes).find((p) => src.includes(p));
            if (!path) throw new Error(`unrouted page call: ${src.slice(0, 120)}`);
            const bodyMatch = /body: (".*?"),\n/s.exec(src);
            calls.push({ path, body: bodyMatch ? JSON.parse(JSON.parse(bodyMatch[1])) : null });
            const route = routes[path];
            return typeof route === 'function' ? route(calls.at(-1)) : route;
        },
    };
}

const ok = (data) => ({ status: 200, json: { code: 0, message: 'OK', data } });

describe('tripo3d polycount bounds', () => {
    it('ties the ceiling to the engine and the topology', () => {
        expect(POLYCOUNT_MAX).toEqual({
            'p1/triangle': 20000,
            'p2/triangle': 50000,
            'p2/quad': 25000,
        });
    });

    it('accepts a value at each ceiling', () => {
        expect(normalizePolycount(20000, 'p1', 'triangle')).toBe(20000);
        expect(normalizePolycount(50000, 'p2', 'triangle')).toBe(50000);
        expect(normalizePolycount(25000, 'p2', 'quad')).toBe(25000);
    });

    // The studio clamps silently (Math.round(Math.min(value, ceiling))). Copying
    // that would bill a 100-credit generation at a face count nobody asked for.
    it('rejects an over-range value instead of clamping it', () => {
        expect(() => normalizePolycount(30000, 'p1', 'triangle')).toThrow(ArgumentError);
        expect(() => normalizePolycount(30000, 'p2', 'quad')).toThrow(/between 500 and 25000 for p2 \+ quad/);
        expect(() => normalizePolycount(499, 'p2', 'triangle')).toThrow(ArgumentError);
        expect(() => normalizePolycount(1.5, 'p2', 'triangle')).toThrow(/must be an integer/);
    });
});

describe('tripo3d resolveSmartMesh', () => {
    it('maps each engine onto the model_version the studio sends', () => {
        expect(resolveSmartMesh({ model: 'p1', topology: 'triangle', polycount: 5000 }).modelVersion)
            .toBe(SMART_MESH_MODEL_VERSIONS.p1);
        expect(resolveSmartMesh({ model: 'p2', topology: 'quad', polycount: 5000 }).modelVersion)
            .toBe(SMART_MESH_MODEL_VERSIONS.p2);
    });

    // P1 renders the Quad button disabled ("Coming Soon"), so quad on P1 is a
    // caller mistake, not a value to downgrade behind their back.
    it('refuses quad on P1 rather than falling back to triangles', () => {
        expect(() => resolveSmartMesh({ model: 'p1', topology: 'quad', polycount: 5000 }))
            .toThrow(/quad topology needs --model p2/);
    });

    it('applies the topology-specific ceiling', () => {
        expect(() => resolveSmartMesh({ model: 'p2', topology: 'quad', polycount: 30000 }))
            .toThrow(ArgumentError);
        expect(resolveSmartMesh({ model: 'p2', topology: 'triangle', polycount: 30000 }).polycount)
            .toBe(30000);
    });

    it('rejects an unknown engine or topology', () => {
        expect(() => resolveSmartMesh({ model: 'p3', topology: 'triangle', polycount: 5000 })).toThrow(ArgumentError);
        expect(() => resolveSmartMesh({ model: 'p2', topology: 'ngon', polycount: 5000 })).toThrow(ArgumentError);
    });
});

describe('tripo3d argument helpers', () => {
    it('resolves a choice case- and separator-insensitively but never guesses', () => {
        expect(resolveChoice('Original Image', ['original_image', 'geometry'], 'alignment')).toBe('original_image');
        expect(() => resolveChoice('geometrics', ['original_image', 'geometry'], 'alignment')).toThrow(ArgumentError);
    });

    it('pulls the project id out of a slugged workspace URL', () => {
        const id = '55002487-478d-4bec-a44f-0824c2bfa6f4';
        expect(parseProjectId(id)).toBe(id);
        expect(parseProjectId(`https://studio.tripo3d.ai/workspace/generate/calculator-3d-model-${id}`)).toBe(id);
        expect(() => parseProjectId('calculator-3d-model')).toThrow(ArgumentError);
    });
});

describe('tripo3d api error classification', () => {
    // Measured against the live studio: signed out is 401 + code 1002, while a
    // refusal against a healthy session is 403 with a business code. Reporting
    // the latter as an auth failure sends the caller off to re-authenticate a
    // session that was never broken.
    it('treats 401 as a lost session', async () => {
        const page = fakePage({
            '/v2/studio/operation/quota': {
                status: 401,
                json: { code: 1002, message: 'Authentication failed' },
            },
        });
        await expect(api(page, '/v2/studio/operation/quota')).rejects.toThrow(AuthRequiredError);
    });

    it('surfaces a 403 business refusal with its own code and message', async () => {
        const page = fakePage({
            '/v2/studio/operation/image_to_model': {
                status: 403,
                json: { code: 6102, message: 'Insufficient membership', suggestion: 'Please check your membership' },
            },
        });
        await expect(api(page, '/v2/studio/operation/image_to_model', { body: {} }))
            .rejects.toThrow(/HTTP 403, code 6102.*Insufficient membership — Please check your membership/);
        await expect(api(page, '/v2/studio/operation/image_to_model', { body: {} }))
            .rejects.not.toThrow(AuthRequiredError);
    });

    it('reports a non-JSON reply instead of pretending it parsed', async () => {
        const page = fakePage({
            '/v2/studio/progress': { status: 503, json: null, raw: '<html>upstream error</html>' },
        });
        await expect(api(page, '/v2/studio/progress', { body: {} }))
            .rejects.toThrow(CommandExecutionError);
    });
});

describe('tripo3d symmetry', () => {
    // A text prompt has no reference image, and the studio posts a literal false
    // for it rather than calling symmetry_check at all.
    it('answers false without a request when there is no source image', async () => {
        const page = fakePage({});
        expect(await resolveSymmetry(page, null)).toBe(false);
        expect(page.calls).toHaveLength(0);
    });

    it('forwards the studio verdict for an uploaded image', async () => {
        const page = fakePage({ '/v2/studio/operation/symmetry_check': ok({ symmetry: true }) });
        expect(await resolveSymmetry(page, { bucket: 'tripo-data', key: 'a/b/input.png' })).toBe(true);
        expect(page.calls[0].body).toEqual({ image: { bucket: 'tripo-data', key: 'a/b/input.png' } });
    });
});

describe('tripo3d visibility', () => {
    // The Privacy control now sits under a "Members Only" heading; a free plan
    // that asks for anything but public gets 403 6102 after the image upload.
    it('auto resolves to public on a plan that cannot set privacy', async () => {
        const page = fakePage({ '/v2/studio/user/profile/payment': ok({ member: { type: 'basic' } }) });
        expect(await resolveVisibility(page, 'auto')).toBe('public');
    });

    it('auto resolves to shareable for a subscriber', async () => {
        const page = fakePage({ '/v2/studio/user/profile/payment': ok({ member: { type: 'pro' } }) });
        expect(await resolveVisibility(page, 'auto')).toBe('shareable');
    });

    it('passes an explicit value straight through', async () => {
        const page = fakePage({});
        expect(await resolveVisibility(page, 'private')).toBe('private');
        expect(page.calls).toHaveLength(0);
    });
});

describe('tripo3d runSmartMesh payload', () => {
    const submit = (overrides) => {
        const page = fakePage({
            '/v2/studio/operation/symmetry_check': ok({ symmetry: true }),
            '/v2/studio/operation/text_to_model': ok({
                operator_id: 'op-1',
                project_id: 'proj-1',
            }),
            '/v2/studio/assets/v2': ok({ projects: [{ id: 'proj-1', project_name: 'stone lantern 3d model' }] }),
        });
        return runSmartMesh(page, {
            endpoint: '/v2/studio/operation/text_to_model',
            mode: 'text',
            payload: { prompt: 'a stone lantern' },
            visibility: 'public',
            wait: false,
            timeoutSec: 600,
            ...resolveSmartMesh({ model: 'p1', topology: 'triangle', polycount: 5000 }),
            ...overrides,
        }).then((rows) => ({ rows, calls: page.calls }));
    };

    it('sends quad as a boolean and never adds symmetry on P1', async () => {
        const { rows, calls } = await submit({});
        const body = calls.find((c) => c.path.endsWith('text_to_model')).body;
        expect(body).toMatchObject({
            face_limit: 5000,
            quad: false,
            visibility: 'public',
            model_version: SMART_MESH_MODEL_VERSIONS.p1,
            prompt: 'a stone lantern',
        });
        expect('symmetry' in body).toBe(false);
        expect(calls.some((c) => c.path.includes('symmetry_check'))).toBe(false);
        expect(rows[0]).toMatchObject({ model: 'p1', topology: 'triangle', symmetry: null });
    });

    it('attaches the symmetry verdict on P2 and reports the topology it asked for', async () => {
        const { rows, calls } = await submit({
            ...resolveSmartMesh({ model: 'p2', topology: 'quad', polycount: 22000 }),
            symmetrySource: { bucket: 'tripo-data', key: 'a/b/input.png' },
        });
        const body = calls.find((c) => c.path.endsWith('text_to_model')).body;
        expect(body).toMatchObject({
            face_limit: 22000,
            quad: true,
            model_version: SMART_MESH_MODEL_VERSIONS.p2,
            symmetry: true,
        });
        expect(rows[0]).toMatchObject({
            model: 'p2',
            topology: 'quad',
            polycount: 22000,
            symmetry: true,
            projectId: 'proj-1',
            operatorId: 'op-1',
            status: 'queued',
            projectName: 'stone lantern 3d model',
        });
    });

    it('fails loudly when the endpoint answers without a task handle', async () => {
        const page = fakePage({ '/v2/studio/operation/text_to_model': ok({}) });
        await expect(runSmartMesh(page, {
            endpoint: '/v2/studio/operation/text_to_model',
            mode: 'text',
            payload: {},
            visibility: 'public',
            wait: false,
            timeoutSec: 600,
            ...resolveSmartMesh({ model: 'p1', topology: 'triangle', polycount: 5000 }),
        })).rejects.toThrow(CommandExecutionError);
    });
});

describe('tripo3d command registry', () => {
    it('registers the Smart Mesh surface with the right access split', () => {
        for (const name of ['assets', 'credits', 'status']) {
            expect(getRegistry().get(`tripo3d/${name}`)).toMatchObject({
                access: 'read',
                strategy: Strategy.INTERCEPT,
                domain: 'studio.tripo3d.ai',
            });
        }
        for (const name of ['text-to-model', 'image-to-model', 'multiview-to-model', 'texture']) {
            expect(getRegistry().get(`tripo3d/${name}`)).toMatchObject({
                access: 'write',
                strategy: Strategy.INTERCEPT,
                domain: 'studio.tripo3d.ai',
            });
        }
    });

    it('offers the engine and topology as declared choices on every generate command', () => {
        for (const name of ['text-to-model', 'image-to-model', 'multiview-to-model']) {
            const args = getRegistry().get(`tripo3d/${name}`).args;
            expect(args.find((a) => a.name === 'model')).toMatchObject({ default: 'p1', choices: ['p1', 'p2'] });
            expect(args.find((a) => a.name === 'topology')).toMatchObject({
                default: 'triangle',
                choices: ['triangle', 'quad'],
            });
            expect(args.find((a) => a.name === 'visibility')).toMatchObject({ default: 'auto' });
        }
    });
});
