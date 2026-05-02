# Extending OpenCLI

OpenCLI has five extension paths. Pick the path based on where you want the source code to live and how you want commands to be shared.

| Goal | Use | Source location | Command surface |
|------|-----|-----------------|-----------------|
| Build a personal website command in your own Git repo | Local plugin | Your project directory, symlinked into `~/.opencli/plugins/` | `opencli <plugin> <command>` |
| Quickly draft a private adapter on this machine | User adapter | `~/.opencli/clis/<site>/<command>.js` | `opencli <site> <command>` |
| Edit an official adapter locally | Adapter override | `~/.opencli/clis/<site>/` | `opencli <site> <command>` |
| Publish or install third-party commands | Plugin | Git repo, installed into `~/.opencli/plugins/` | `opencli <plugin> <command>` |
| Wrap an existing local binary | External CLI | `~/.opencli/external-clis.yaml` | `opencli <tool> ...` |

## Personal commands in your own Git repo

Use a local plugin when you want the code to stay in a normal project directory and be managed by Git.

```bash
opencli plugin create my-cnn
cd my-cnn
git init
opencli plugin install file://$(pwd)
opencli my-cnn hello
```

`plugin install file://...` creates a symlink under `~/.opencli/plugins/`. Your source files stay in your project directory, so edits and commits happen there.

This is the recommended path for custom commands you own long-term.

## Private adapters in `~/.opencli/clis`

Use a user adapter when you want the fastest local adapter loop and do not need a separate project directory.

```bash
opencli browser init cnn/top
# edit ~/.opencli/clis/cnn/top.js
opencli browser verify cnn/top
opencli cnn top
```

User adapters are loaded from:

```text
~/.opencli/clis/<site>/<command>.js
```

This path is convenient for quick local automation. For code you want to version, review, or share, prefer a plugin.

## Local overrides for official adapters

Use `adapter eject` when you want to customize an existing official adapter.

```bash
opencli adapter eject twitter
opencli adapter status
# edit ~/.opencli/clis/twitter/*.js
opencli adapter reset twitter
```

Ejected adapters override the packaged official adapter on this machine. `adapter reset` removes the local override and returns to the packaged version.

## Plugins for sharing commands

Plugins are third-party command packages. They can be installed from GitHub, any git-cloneable URL, or a local directory.

```bash
opencli plugin install github:user/opencli-plugin-my-tool
opencli plugin install https://github.com/user/opencli-plugin-my-tool
opencli plugin install file:///absolute/path/to/plugin
opencli plugin list
opencli plugin update --all
opencli plugin uninstall my-tool
```

Each plugin directory is scanned for `.ts` and `.js` command files. TypeScript plugins are transpiled during install.

See [Plugins](./plugins.md) for manifest fields, TypeScript examples, update behavior, and monorepo publishing.

## Multiple custom sites in one repo

For a Git-hosted plugin collection, declare sub-plugins in `opencli-plugin.json` and install from GitHub:

```json
{
  "plugins": {
    "cnn": { "path": "packages/cnn" },
    "reuters": { "path": "packages/reuters" }
  }
}
```

```bash
opencli plugin install github:user/opencli-plugins
opencli plugin install github:user/opencli-plugins/cnn
```

For local development, install each sub-plugin directory directly:

```bash
opencli plugin install file:///absolute/path/opencli-plugins/packages/cnn
opencli plugin install file:///absolute/path/opencli-plugins/packages/reuters
```

Local `file://` installs expect the target directory itself to be a valid plugin with command files. For a monorepo root, push it to GitHub and install it with the GitHub monorepo flow.

## External CLI passthrough

Use external CLI registration when the command already exists as a binary on your machine and you want it available through `opencli`.

```bash
opencli external register my-tool \
  --binary my-tool \
  --install "npm i -g my-tool" \
  --desc "My internal CLI"

opencli my-tool --help
```

External CLIs pass stdio and exit codes through to the underlying binary.
