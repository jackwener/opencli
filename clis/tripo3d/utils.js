// Shared helpers for the tripo3d adapters (Tripo Studio, Smart Mesh engine).
//
// Strategy: PAGE_FETCH for every JSON call.
//
//   * The studio API lives on api.tripo3d.ai and authenticates with an HttpOnly
//     cookie on .tripo3d.ai — the captured requests carry no bearer token and no
//     CSRF header. api.tripo3d.ai sits behind Cloudflare bot management (__cf_bm),
//     which binds to the browser's TLS/UA fingerprint, so the calls are issued
//     from the page's own origin instead of replayed Node-side.
//   * Tripo also publishes a documented REST API on platform.tripo3d.ai, but it
//     needs a separate API key rather than the studio session these commands are
//     built to reuse, so it is not an alternative here.
//
// Note on file export: it is NOT a server-side endpoint. `operation/export-lite`
// returns `{}` and only bumps the account's monthly export counter; the FBX/OBJ/
// STL file is produced inside the page and handed to the browser as a Blob, so
// exporting a finished model has to drive the studio's own Export dialog. That
// command is not part of this adapter yet.
import { readFile } from 'node:fs/promises';
import { createHash, createHmac } from 'node:crypto';
import { basename, extname } from 'node:path';
import {
    ArgumentError,
    AuthRequiredError,
    CommandExecutionError,
    TimeoutError,
} from '@jackwener/opencli/errors';

export const HOST = 'studio.tripo3d.ai';
export const STUDIO_ORIGIN = 'https://studio.tripo3d.ai';
export const API_ORIGIN = 'https://api.tripo3d.ai';
export const WORKSPACE_URL = `${STUDIO_ORIGIN}/workspace/generate`;

/**
 * Smart Mesh is the Nexus engine, and its AI Model dropdown offers two of them.
 * The other tab ("HD Model") runs v2.5/v3.x with a different option set, so only
 * the two Nexus lines are selectable here — every command in this suite is
 * Smart Mesh only.
 */
export const SMART_MESH_MODELS = ['p1', 'p2'];

export const SMART_MESH_MODEL_VERSIONS = {
    p1: 'Nexus-v1.0-20260214',
    p2: 'Nexus-v2.0-20260801',
};

/**
 * The studio itself now defaults the dropdown to P2, but this suite stays on P1:
 * P2 is nearly 3x the price, and flipping the default would silently retag every
 * existing command line from 35 credits to 100. Opt in with `--model p2`.
 */
export const SMART_MESH_MODEL_DEFAULT = 'p1';

/** Credits the Generate button quotes per job, before the P2 free trial. */
export const SMART_MESH_CREDITS = { p1: 35, p2: 100 };

/** Texture generation runs on its own model line, independent of the mesh engine. */
export const TEXTURE_MODEL = 'v3.0-20250812';

/** Text-to-model first renders a reference image with this generator. */
export const TEXT_IMAGE_MODEL = 'flux.1_dev';

/**
 * Topology toggle in the Topology popover. Quad is **P2 only**: on P1 the button
 * renders disabled with a "Coming Soon" label, so `--topology quad --model p1` is
 * rejected rather than quietly downgraded to triangles.
 */
export const TOPOLOGIES = ['triangle', 'quad'];
export const TOPOLOGY_DEFAULT = 'triangle';

/** Polycount slider bounds read off the Topology popover. */
export const POLYCOUNT_MIN = 500;
export const POLYCOUNT_DEFAULT = 5000;

/**
 * The slider's ceiling moves with the engine and the topology — a quad job packs
 * four-sided faces, so the same budget buys fewer of them.
 */
export const POLYCOUNT_MAX = {
    'p1/triangle': 20000,
    'p2/triangle': 50000,
    'p2/quad': 25000,
};

export const POLYCOUNT_HELP =
    `Target face count, min ${POLYCOUNT_MIN}. The ceiling follows --model/--topology: `
    + Object.entries(POLYCOUNT_MAX).map(([k, v]) => `${k} ${v}`).join(', ');

/** Privacy dropdown values, in the site's own order. */
export const VISIBILITIES = ['public', 'private', 'shareable'];

/**
 * `auto` is not one of the site's values: it means "whatever the studio would
 * preselect for this account".
 *
 * The whole Privacy control now sits under a "Members Only" heading — on a free
 * plan clicking it opens the pricing dialog instead of a dropdown, and asking the
 * API for anything but `public` comes back as HTTP 403 `6102 Insufficient
 * membership`, *after* the reference image has already been uploaded. Defaulting
 * to `auto` keeps a free account working without ever publishing a subscriber's
 * model more widely than the site would have.
 */
export const VISIBILITY_CHOICES = ['auto', ...VISIBILITIES];
export const VISIBILITY_DEFAULT = 'auto';

/** Texture Resolution → the API's texture_quality code. */
export const TEXTURE_QUALITY_BY_SIZE = {
    '2k': 'standard',
    '4k': 'detailed',
    '8k': 'extreme',
};

/** How the texture is anchored: to the source image, or to the bare geometry. */
export const TEXTURE_ALIGNMENTS = ['original_image', 'geometry'];

/** A task stops moving once it reaches one of these. */
export const TERMINAL_STATUSES = ['success', 'failed', 'banned', 'cancelled', 'expired'];

const MIME_BY_EXT = {
    '.png': { mime: 'image/png', format: 'png' },
    '.jpg': { mime: 'image/jpeg', format: 'jpg' },
    '.jpeg': { mime: 'image/jpeg', format: 'jpg' },
    '.webp': { mime: 'image/webp', format: 'webp' },
};

/** The uploader mirrors the site's own limit ("JPG,PNG,WEBP Size ≤ 20MB"). */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/**
 * Validate a bounded integer without silently clamping it: a polycount outside
 * the slider's range is a caller mistake, and quietly generating 5000 faces when
 * 50000 was asked for would bill a generation the caller did not want.
 *
 * The page *does* clamp (`Math.round(Math.min(t, ceiling))`), which is exactly
 * why this does not — a clamp the caller cannot see is a 100-credit surprise.
 */
export function normalizePolycount(value, model, topology) {
    const max = POLYCOUNT_MAX[`${model}/${topology}`];
    if (!max) throw new ArgumentError(`no polycount range is defined for model ${model} + topology ${topology}`);

    const n = Number(value ?? POLYCOUNT_DEFAULT);
    if (!Number.isInteger(n)) throw new ArgumentError('polycount must be an integer');
    if (n < POLYCOUNT_MIN || n > max) {
        throw new ArgumentError(
            `polycount must be between ${POLYCOUNT_MIN} and ${max} for ${model} + ${topology} (Smart Mesh slider range), got ${n}`,
        );
    }
    return n;
}

/**
 * Resolve the three coupled Topology arguments in one place, so all three
 * generate commands reject the same combinations with the same wording.
 */
export function resolveSmartMesh({ model, topology, polycount }) {
    const engine = resolveChoice(model, SMART_MESH_MODELS, 'model');
    const topo = resolveChoice(topology, TOPOLOGIES, 'topology');
    if (topo === 'quad' && engine !== 'p2') {
        throw new ArgumentError(
            `quad topology needs --model p2: on ${engine} the studio renders the Quad button disabled ("Coming Soon") and the engine only emits triangles`,
        );
    }
    return {
        model: engine,
        topology: topo,
        modelVersion: SMART_MESH_MODEL_VERSIONS[engine],
        polycount: normalizePolycount(polycount, engine, topo),
    };
}

/** Positive integer seconds, with a floor so a too-eager timeout cannot abort a live task. */
export function normalizeTimeout(value, defaultValue, { min = 30 } = {}) {
    const n = Number(value ?? defaultValue);
    if (!Number.isInteger(n) || n <= 0) throw new ArgumentError('timeout must be a positive integer (seconds)');
    if (n < min) throw new ArgumentError(`timeout must be >= ${min} seconds`);
    return n;
}

/** Case- and spacing-insensitive key shared by every "resolve a label" helper. */
const foldKey = (value) => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

/**
 * Map user input onto one of `allowed`, rejecting anything else rather than
 * falling back to the default — a typo must not silently publish a model or
 * spend credits on the wrong setting.
 */
export function resolveChoice(value, allowed, label) {
    const key = foldKey(value);
    const hit = allowed.find((a) => foldKey(a) === key);
    if (!hit) throw new ArgumentError(`Unknown ${label} "${value}". Valid: ${allowed.join(' / ')}`);
    return hit;
}

/**
 * Accept a bare project id or any workspace URL that ends in one.
 *
 * The site's own links are slugged (`/workspace/generate/red-apple-…-<uuid>`),
 * so pasting one back has to keep working.
 */
export function parseProjectId(value) {
    const raw = String(value ?? '').trim();
    if (!raw) throw new ArgumentError('project is required: pass a project id or a workspace URL');
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(raw);
    if (!uuid) {
        throw new ArgumentError(`"${raw}" does not contain a project id (expected a UUID, or a studio.tripo3d.ai workspace URL)`);
    }
    return uuid[0].toLowerCase();
}

/** Workspace deep link for a project — the handle a human needs to see the result. */
export const workspaceUrl = (projectId) => `${STUDIO_ORIGIN}/workspace/generate/${projectId}`;

// ---------------------------------------------------------------------------
// Page + API
// ---------------------------------------------------------------------------

/**
 * Make sure the tab is on the studio origin.
 *
 * Every API call runs as a page-context fetch, and api.tripo3d.ai only answers
 * credentialed requests whose Origin is the studio — a stray tab would fail CORS
 * long before it ever failed auth.
 */
export async function ensureStudio(page, url = WORKSPACE_URL) {
    let origin = null;
    try {
        origin = await page.evaluate('location.origin');
    } catch {
        origin = null;
    }
    if (origin === STUDIO_ORIGIN) return;
    await page.goto(url, { waitUntil: 'load' });
}

/**
 * Call one studio endpoint from inside the page and return its `data` payload.
 *
 * @throws {AuthRequiredError} when the session cookie is gone or rejected
 * @throws {CommandExecutionError} for a non-JSON reply or a non-zero `code`
 */
export async function api(page, path, { method = 'POST', body = null } = {}) {
    const src = `(async () => {
        let res;
        try {
            res = await fetch(${JSON.stringify(API_ORIGIN + path)}, {
                method: ${JSON.stringify(method)},
                credentials: 'include',
                headers: ${body === null ? '{}' : "{ 'content-type': 'application/json' }"},
                body: ${body === null ? 'undefined' : JSON.stringify(JSON.stringify(body))},
            });
        } catch (error) {
            return { failed: String(error && error.message || error) };
        }
        const raw = await res.text();
        try {
            return { status: res.status, json: JSON.parse(raw) };
        } catch {
            return { status: res.status, json: null, raw: raw.slice(0, 300) };
        }
    })()`;

    const reply = await page.evaluate(src);
    if (!reply || reply.failed) {
        throw new CommandExecutionError(`request to ${path} could not be sent from the page: ${reply?.failed || 'no response'}`);
    }
    // 401 is the only status that means "signed out" — the studio answers it with
    // code 1002 "Authentication failed". A 403 is a *business* refusal against a
    // perfectly good session (6102 "Insufficient membership" when a free plan asks
    // for a private model), and calling that a login failure sends the caller off
    // to re-authenticate something that was never broken.
    if (reply.status === 401) throw new AuthRequiredError(HOST);
    if (!reply.json) {
        throw new CommandExecutionError(`${path} returned a non-JSON response (HTTP ${reply.status}): ${reply.raw || '(empty)'}`);
    }

    const { code, message, suggestion, data } = reply.json;
    if (code !== 0) {
        const detail = [message, suggestion].filter(Boolean).join(' — ') || `code ${code}`;
        throw new CommandExecutionError(`${path} failed (HTTP ${reply.status}, code ${code}): ${detail}`);
    }
    return data;
}

/**
 * Turn `--visibility auto` into the value the studio's own Privacy dropdown
 * would be holding, and pass every explicit choice straight through.
 */
export async function resolveVisibility(page, value) {
    const choice = resolveChoice(value, VISIBILITY_CHOICES, 'visibility');
    if (choice !== 'auto') return choice;

    const payment = await api(page, '/v2/studio/user/profile/payment', { method: 'GET' }).catch(() => null);
    // The store preselects Sharing Only for subscribers and Public for everyone
    // else, off exactly this test: `payment.member.type !== 'basic'`.
    const plan = payment?.member?.type ?? null;
    return plan && plan !== 'basic' ? 'shareable' : 'public';
}

/** Fail fast with a typed error when the browser is not signed in to the studio. */
export async function requireSession(page) {
    const profile = await api(page, '/v2/studio/wm-biz/user/profile', { body: {} });
    if (!profile?.user_id) throw new AuthRequiredError(HOST);
    return profile;
}

/**
 * Poll one operator (task) until it stops moving.
 *
 * `progress` is the only signal the site has: there is no webhook and no
 * completion event on the REST surface, so the UI polls the same endpoint.
 *
 * @returns the terminal progress row
 * @throws {TimeoutError} when the deadline passes while it is still running
 */
export async function waitForOperator(page, operatorId, timeoutSec, label) {
    const deadline = Date.now() + timeoutSec * 1000;
    let last = null;
    for (;;) {
        const rows = await api(page, '/v2/studio/progress', { body: { ids: [operatorId] } });
        last = (Array.isArray(rows) ? rows : []).find((r) => r.operator_id === operatorId) || last;
        if (last && TERMINAL_STATUSES.includes(last.status)) return last;
        if (Date.now() >= deadline) throw new TimeoutError(label, timeoutSec);
        await sleep(3000);
    }
}

/**
 * Look the project up in the asset list so a generate command can report the
 * name the site assigned. Scoped to the first pages: a project that was just
 * created is always at the top, and this is decoration, never a hard failure.
 */
export async function findProject(page, projectId, { pages = 2, size = 20 } = {}) {
    for (let i = 0; i < pages; i++) {
        const data = await api(page, `/v2/studio/assets/v2?asset_type=mine&offset=${i * size}&size=${size}&type=all`, { method: 'GET' });
        const hit = (data?.projects || []).find((p) => p.id === projectId);
        if (hit) return hit;
        if ((data?.projects || []).length < size) break;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Image upload (temporary STS token → S3 PUT → moderation)
// ---------------------------------------------------------------------------

const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/**
 * Sign and PUT the image straight to S3 from Node.
 *
 * The studio hands out short-lived STS credentials and the page uploads with the
 * AWS SDK. Node-side signing keeps the image bytes off the browser bridge (a
 * 20 MB base64 round-trip through `evaluate` does not survive), and S3 itself is
 * not the Cloudflare-fronted host, so there is no session to reuse here.
 */
async function putToS3(token, bytes, contentType) {
    const region = String(token.host || '').split('.')[1] || 'us-west-2';
    const host = `${token.resource_bucket}.${token.host}`;
    const canonicalUri = `/${String(token.resource_uri).split('/').map(encodeURIComponent).join('/')}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256hex(bytes);

    const headers = {
        host,
        'content-type': contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'x-amz-security-token': token.session_token,
    };
    const names = Object.keys(headers).sort();
    const signedHeaders = names.join(';');
    const canonicalHeaders = names.map((k) => `${k}:${headers[k]}\n`).join('');
    const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        scope,
        sha256hex(Buffer.from(canonicalRequest)),
    ].join('\n');

    let signingKey = hmac(Buffer.from(`AWS4${token.sts_sk}`), dateStamp);
    for (const part of [region, 's3', 'aws4_request']) signingKey = hmac(signingKey, part);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${token.sts_ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    delete headers.host;

    let res;
    try {
        res = await fetch(`https://${host}${canonicalUri}`, { method: 'PUT', headers, body: bytes });
    } catch (error) {
        throw new CommandExecutionError(`image upload to storage failed: ${error?.message || error}`);
    }
    if (!res.ok) {
        throw new CommandExecutionError(`image upload to storage failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return { bucket: token.resource_bucket, key: token.resource_uri };
}

/** Read one local image and reject anything the studio would not accept. */
async function readImage(path) {
    const ext = extname(path).toLowerCase();
    const kind = MIME_BY_EXT[ext];
    if (!kind) {
        throw new ArgumentError(`unsupported image type "${ext || path}" (use ${Object.keys(MIME_BY_EXT).join(' / ')})`);
    }
    let bytes;
    try {
        bytes = await readFile(path);
    } catch (error) {
        throw new ArgumentError(`cannot read image "${path}": ${error?.message || error}`);
    }
    if (bytes.length === 0) throw new ArgumentError(`image "${path}" is empty`);
    if (bytes.length > MAX_IMAGE_BYTES) {
        throw new ArgumentError(`image "${path}" is larger than the studio's 20MB limit (${bytes.length} bytes)`);
    }
    return { bytes, ...kind };
}

/**
 * Upload one image and run it through the studio's moderation gate.
 *
 * @returns the image reference the generate endpoints expect
 * @throws {CommandExecutionError} when moderation does not return `pass`
 */
export async function uploadImage(page, path) {
    const { bytes, mime, format } = await readImage(path);
    const token = await api(page, '/v2/studio/storage/temporary_token', { body: { client: 'aws', format } });
    if (!token?.sts_ak || !token?.resource_uri) {
        throw new CommandExecutionError(`the studio did not issue an upload token for "${basename(path)}"`);
    }

    const stored = await putToS3(token, bytes, mime);
    const audit = await api(page, '/v2/studio/audit/image', { body: { image: stored } });
    const result = audit?.result || null;
    if (result !== 'pass') {
        throw new CommandExecutionError(
            `"${basename(path)}" was rejected by the studio's image moderation (result: ${result ?? 'unknown'})`,
        );
    }
    return { ...stored, image_audit_result: result };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** Columns shared by the three Smart Mesh generate commands. */
export const GENERATE_COLUMNS = [
    'mode',
    'model',
    'projectId',
    'operatorId',
    'status',
    'progress',
    'topology',
    'polycount',
    'symmetry',
    'visibility',
    'prompt',
    'images',
    'projectName',
    'workspaceUrl',
];

/**
 * Ask the studio whether the reference image is bilaterally symmetric.
 *
 * P2 takes a `symmetry` flag that the UI never exposes as a control: the page
 * runs `symmetry_check` on whichever image the viewer is looking at and forwards
 * the verdict. Text mode has no reference image at all, so the page posts a
 * literal `false` — passing `null` here reproduces that.
 */
export async function resolveSymmetry(page, image) {
    if (!image) return false;
    const data = await api(page, '/v2/studio/operation/symmetry_check', {
        body: { image: { bucket: image.bucket, key: image.key } },
    });
    return data?.symmetry === true;
}

/**
 * Remaining P2 free trials, or null when the account has no such pool.
 *
 * The site gates P2 on this: run out as a non-subscriber and the studio pops its
 * pricing dialog and silently resets the dropdown back to P1.
 */
export async function smartMeshP2Trial(page) {
    // POST with no body, the way the page sends it (`{}` is accepted too).
    const data = await api(page, '/v2/studio/operation/quota').catch(() => null);
    return data?.quota?.generation?.smart_mesh_v2 ?? null;
}

/**
 * Submit one Smart Mesh job and, unless told otherwise, wait for it to land.
 *
 * Every generate endpoint takes the same envelope (face_limit / quad /
 * visibility / model_version) and answers with the same handle, so the three
 * commands differ only in the mode-specific keys they merge in.
 *
 * @param symmetrySource the reference image P2 should run `symmetry_check` on,
 *   or null for a text prompt (which has no image and therefore no symmetry)
 */
export async function runSmartMesh(page, {
    endpoint,
    mode,
    payload,
    model,
    topology,
    modelVersion,
    polycount,
    visibility,
    symmetrySource = null,
    prompt = null,
    images = null,
    wait = true,
    timeoutSec,
}) {
    // P1 has no `symmetry` key at all: the page only attaches one once the
    // dropdown is on P2, so the older engine never sees the field.
    const symmetry = model === 'p2' ? await resolveSymmetry(page, symmetrySource) : null;

    const created = await api(page, endpoint, {
        body: {
            face_limit: polycount,
            quad: topology === 'quad',
            visibility,
            model_version: modelVersion,
            ...(symmetry === null ? {} : { symmetry }),
            ...payload,
        },
    });

    const operatorId = created?.operator_id || created?.task_id || null;
    const projectId = created?.project_id || null;
    if (!operatorId || !projectId) {
        throw new CommandExecutionError(`${endpoint} accepted the request but returned no task handle`);
    }

    // Keys are job-prefixed so they can never collide with an output column —
    // a same-named intermediate is what makes a dropped column silent.
    let jobStatus = 'queued';
    let jobProgress = null;
    if (wait) {
        const done = await waitForOperator(page, operatorId, timeoutSec, `${mode} generation`);
        jobStatus = done.status;
        jobProgress = done.progress ?? null;
        if (jobStatus !== 'success') {
            throw new CommandExecutionError(
                `${mode} generation ended as "${jobStatus}" (project ${projectId}, operator ${operatorId}) — open ${workspaceUrl(projectId)} for the site's own explanation`,
            );
        }
    }

    const project = await findProject(page, projectId).catch(() => null);

    return [{
        mode,
        model,
        projectId,
        operatorId,
        status: jobStatus,
        progress: jobProgress,
        topology,
        polycount,
        symmetry,
        visibility,
        prompt,
        images,
        projectName: project?.project_name ?? null,
        workspaceUrl: workspaceUrl(projectId),
    }];
}
