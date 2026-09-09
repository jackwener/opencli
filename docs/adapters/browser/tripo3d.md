# Tripo3D

**Mode**: 🔐 Browser · **Domain**: `studio.tripo3d.ai`

Drive [Tripo Studio](https://studio.tripo3d.ai)'s **Smart Mesh** engine from the CLI: turn a prompt, a reference image, or a set of orthographic views into a 3D mesh, bake a texture onto it, and track the jobs and the credits they cost.

## Commands

| Command | Description |
|---------|-------------|
| `opencli tripo3d text-to-model <prompt>` | Generate an untextured mesh from a text prompt |
| `opencli tripo3d image-to-model <image>` | Generate an untextured mesh from one reference image |
| `opencli tripo3d multiview-to-model <front>` | Generate an untextured mesh from front/left/back/right views |
| `opencli tripo3d texture <project>` | Bake a texture onto an existing project's mesh |
| `opencli tripo3d status <operators>` | Check generation tasks by operator id |
| `opencli tripo3d assets` | List workspace projects with their ids |
| `opencli tripo3d credits` | Credit balance, plan, export allowance, and P2 free trials |

## Usage Examples

```bash
# Check what a run will cost before spending anything
opencli tripo3d credits -f json

# Smart Mesh P1: fast, triangles only, 35 credits
opencli tripo3d text-to-model "a small stylized wooden treasure chest" --polycount 4000 -f json

# Smart Mesh P2: quad topology, 100 credits (2 free trials on a new account)
opencli tripo3d image-to-model ./chest.png --model p2 --topology quad --polycount 22000 -f json

# Four orthographic views; only the front one is required
opencli tripo3d multiview-to-model ./front.png --left ./left.png --back ./back.png -f json

# Fire and forget, then poll
opencli tripo3d text-to-model "a low poly stone lantern" --wait false -f json
opencli tripo3d status 7c3e5a18-90bd-42f6-b1c4-5de8073af921 -f json

# Bake a 4K texture onto a mesh that already exists
opencli tripo3d assets --limit 10 -f json
opencli tripo3d texture 1f4b0c9a-6d21-4e5f-8a37-2c9de4b170aa --size 4k -f json
```

`texture` and the project argument of any command accept a bare project id or a full slugged `studio.tripo3d.ai/workspace/generate/...` URL. `status` takes one or more comma-separated **operator** ids — the handle every generate command returns — not project ids.

## Smart Mesh engines and topology

The Smart Mesh tab offers two engines, and they differ in more than speed:

| | `--model p1` | `--model p2` |
|---|---|---|
| Studio label | P1.0 - Fast | P2.0 - Preview |
| Quad topology | not available | `--topology quad` |
| `--polycount` range | 500–20000 | 500–50000 triangle, 500–25000 quad |
| Credits | 35 | 100, with 2 free trials per account |

`p1` is the default even though the studio's own dropdown now defaults to P2, so an existing command line keeps costing what it always did. Ask for `--model p2` to opt into the newer engine, and check `credits` for `p2TrialsLeft` before a batch.

`--topology quad` requires `--model p2`; asking for it on P1 is an error rather than a silent downgrade to triangles, because the studio renders that button disabled. Polycount is likewise validated against the engine and topology instead of being clamped, so a value the engine would quietly round down is reported before the credits are spent.

P2 also sends a `symmetry` flag that the studio has no control for: it runs its own symmetry check on the main reference image and forwards the verdict. The adapter reproduces that — a text prompt has no reference image and sends `false`, an image sends the checked verdict, and multi-view uses the front slot.

## Privacy

`--visibility` defaults to `auto`, which resolves to whatever the studio's own Privacy dropdown would hold for the account: `public` on a free plan, `shareable` for a subscriber. The control sits behind a "Members Only" gate, so asking for `private` or `shareable` without a paid plan is refused by the API — after the reference image has already been uploaded.

## Output

Generate commands return the project and operator ids, the job status and progress, and the settings the request actually carried (`model`, `topology`, `polycount`, `symmetry`, `visibility`) plus a workspace URL for a human to open. `assets` returns each project's ids, name, operator type, texture state, and visibility. `status` returns the raw progress rows. `credits` returns the wallet, plan, monthly export allowance, and remaining P2 trials.

Every JSON call is issued from the studio's own page context: `api.tripo3d.ai` authenticates with an HttpOnly cookie and sits behind Cloudflare bot management, so replaying the requests from Node risks intermittent challenges. Tripo's documented REST API on `platform.tripo3d.ai` is a separate product that needs its own API key rather than the studio session these commands reuse.

## Prerequisites

- Chrome running with the [Browser Bridge extension](/guide/browser-bridge) installed
- A signed-in Tripo Studio session — every command needs it
- Credits for `text-to-model`, `image-to-model`, `multiview-to-model`, and `texture`; the read commands are free

## Not covered yet

Exporting a finished model to a local FBX/OBJ/GLB is not a server-side endpoint — `operation/export-lite` returns `{}` and only bumps a counter, while the file itself is built inside the page and handed to the browser as a Blob. A `download` command therefore has to drive the studio's Export dialog, which is left for a follow-up. The `operation/download_with_name` endpoint does hand back a signed URL to the mesh the studio already stores for an operator, so that is the cheaper path when the native asset is enough and no format conversion is needed.

The studio's other tools — HD Model, Segment, Retopo, Texture Edit/Upscale/PBR, Rigging, Generate in Parts — are separate engines with their own option sets and are not wrapped here.
