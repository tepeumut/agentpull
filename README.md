# agentpull

Manage AI agent configurations from any git host. Tracked, verified, updatable.

`agentpull` is a CLI for pulling agent config files — Cursor rules, Copilot instructions, Claude `CLAUDE.md`, Windsurf rules, Antigravity `GEMINI.md`, Aider configs, and cross-agent `AGENTS.md` — from shared repositories into your projects, with a tracked-install manifest so you can update and remove them cleanly.

Supports **GitHub**, **GitLab** (cloud + self-hosted), **Bitbucket Cloud**, **Azure DevOps Repos**, and a generic **`git clone`** fallback for any other host.

> ⚠️ **Disclaimer — use at your own risk.**
>
> `agentpull` is **pre-1.0 software**. The version on npm may change in incompatible ways without warning.
>
> By design, this tool **downloads files from third-party repositories and writes them into your project tree.** Those files become inputs to AI coding agents (Cursor, Claude, Copilot, …) that may then act on them. **You are responsible for vetting every repository you install from** — `agentpull` is a delivery mechanism, not a trust authority.
>
> The bundled security scanner (`--scan` / `autoScan`) is **opt-in, best-effort, and not exhaustive.** It catches a curated set of patterns (shell injection, env exfiltration, prompt injection, embedded secrets); it will not catch every malicious construction, especially novel prompt-injection payloads. **Do not treat a clean scan as a safety guarantee.**
>
> Stored credentials live in your OS keychain and are passed to outbound HTTPS requests by the matching provider. Bugs in the keychain code, the redirect allow-list, or the credential helper for `git clone` could in theory leak a token. Audit before granting access to private repos with broad scopes — prefer the **narrowest possible token** for each provider (e.g. `public_repo` only, fine-grained PATs scoped to a single repo, read-only app passwords).
>
> The MIT License (see `LICENSE`) provides the project **AS IS, WITHOUT WARRANTY OF ANY KIND**. The authors and contributors accept no liability for data loss, leaked credentials, malicious agent behavior, supply-chain compromise, or any other damage arising from use of this tool. **If that's not acceptable for your environment, do not install it.**

## Why

- Agent configs live in a dozen different places (`.cursorrules`, `.github/copilot-instructions.md`, `CLAUDE.md`, `.windsurfrules`, `AGENTS.md`, …) and teams copy-paste them across projects.
- There's no tracked install: once a file lands, you have no record of where it came from or whether it's been tampered with.
- Updating is manual. "Is this file the latest version?" requires a diff by hand.
- Pulling arbitrary files from someone else's repo into your project is a supply-chain risk with no safety layer.

`agentpull` fixes all four: a receipt-style manifest, SHA-256 integrity per file, a three-way-diff update flow, and an opt-in content scanner.

## Install

```sh
npm install -g agentpull
```

Requires Node.js 20 or newer (uses native `fetch` and `crypto`). The generic `git` provider additionally needs a `git` binary on `PATH` — every other provider works without one.

## Quick start

The fastest path is the **interactive wizard** — it walks you through host selection, auth, repo URL, and install in one prompt:

```sh
agentpull wizard
```

Or step-by-step manually:

```sh
# In your project
agentpull init

# (optional) save credentials for a private repo
agentpull auth login --provider github

# Register a repo with a short name
agentpull registry add github.com/company/agents --name team

# Install agent configs from that repo
agentpull add team

# See what's installed
agentpull list

# Pull updates
agentpull update
```

Same flow with a different host:

```sh
agentpull auth login --provider gitlab
agentpull registry add https://gitlab.com/group/subgroup/agents --name team
agentpull add team
```

## Supported agents

| Agent | File patterns |
|---|---|
| **Cursor** | `.cursorrules`, `.cursor/**` (rules, commands, agents, …) |
| **GitHub Copilot** | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/prompts/*.prompt.md`, `.github/agents/*.agent.md`, `.github/skills/**` |
| **VS Code** | `.vscode/agents/**`, `.vscode/*.agent.md` |
| **Claude Code** | `CLAUDE.md`, `.claude/**` (commands, agents, skills) |
| **Windsurf** | `.windsurfrules`, `.windsurf/**` (rules, workflows) |
| **Google Antigravity** | `GEMINI.md`, `.agent/**` (rules, skills, workflows) |
| **Aider** | `.aider.conf.yml`, `.aiderignore`, `.aider.model.settings.yml` |
| **Cline** | `.clinerules` (single file or directory) |
| **Continue.dev** | `.continue/**` (config, rules, checks, prompts) |
| **Cross-agent** | `AGENTS.md`, `.agents/skills/**` |

`AGENTS.md` is deliberately owned by the cross-agent handler only, so it isn't double-installed via Copilot or Antigravity. The Cursor, Claude, Windsurf, Antigravity, and Continue handlers all use catch-all `**` matches under their respective top-level directories — this is intentional so new subdirectories those tools add in the future are picked up automatically.

## Commands

### `agentpull init`
Create `.agentpull.json` in the current directory.

- `--force` — reinitialize an existing manifest

### `agentpull wizard`
Step-by-step guided setup (recommended for first-time users). Walks you through:

1. Initializing a manifest (if none exists)
2. Picking a host provider (GitHub / GitLab / Bitbucket / Azure DevOps / generic git)
3. Optional self-hosted hostname
4. Saving credentials in the OS keychain (if not already present)
5. Entering a repo URL or shorthand
6. Optional subdirectory and ref
7. Choosing which agent types to install

Ctrl-C exits cleanly at any prompt.

### `agentpull add [name]`
Install agent configs from a registered repo or a direct repository URL on any supported host.

- `--ref <ref>` — branch, tag, or commit (default: `HEAD`)
- `--agent <types>` — comma-separated list of agent types to install (e.g. `cursor,copilot`)
- `--scan` — run the security scanner on downloaded files before installing
- `--overwrite` — overwrite existing files without prompting

If `--agent` is omitted, `agentpull` detects which agent types are present and asks you to pick.

**Interactive mode**: run `agentpull add` with no name and you'll get a picker listing every registered repo with its URL and default ref. Useful when you have several registered and don't remember the short names.

### `agentpull update [name]`
Re-download and reconcile an installed entry.

- `--scan` — run the security scanner on the new files
- `--force` — bypass the up-to-date check, evict the cached tarball, and overwrite every conflicting file (including hand-written ones). The escape hatch when "the update isn't pulling my changes" — see [Sync model](#sync-model).
- `-y, --yes` — non-interactive: update **all** installed entries without prompting (CI-friendly).

**Interactive mode**: run `agentpull update` with no name and you'll get a picker offering "update all" or any single installed entry (with its pinned SHA). Pass `--yes` to skip the picker and always update everything (the historical behavior). If only one entry is installed, the picker is skipped automatically.

When upstream files would clobber existing local files, `agentpull` shows a **classified conflict prompt** that distinguishes:

- **HAND-WRITTEN** — files you authored, not tracked by agentpull. Default action: skip.
- **LOCALLY MODIFIED** — files installed by agentpull that you've edited since. Default action: skip.
- **CONFLICTS WITH OTHER ENTRY** — files installed by a different `agentpull` entry. Default action: skip.
- Tracked, no local changes — silently overwritten (these are the agentpull content moving forward).

The default is non-destructive: hand-written and locally-modified files are preserved unless you explicitly pick "Overwrite EVERYTHING" or pass `--force`.

### `agentpull remove [name]`
Uninstall files and remove the manifest entry. Empty parent directories are cleaned up.

- `-y, --yes` — skip the "Remove X?" confirmation prompt.

**Interactive mode**: run `agentpull remove` with no name and you'll get a picker listing every installed entry with its file count and source URL. Confirms before deleting unless you pass `--yes`.

### `agentpull list` (alias: `ls`)
Show installed entries with integrity status. A `✓` means every file matches its recorded hash; `⚠ N modified` flags locally-edited files.

- `--json` — machine-readable output

### `agentpull scan <path>`
Run the content scanner on a file or directory. Useful for inspecting a repo before installing it.

### `agentpull auth login`
Authenticate with a git host and store the credential in the OS keychain. Required for private repos.

- `--provider <id>` — `github`, `gitlab`, `bitbucket`, or `azure`. If omitted, you're prompted to pick.
- `--host <host>` — override the default host (for self-hosted GitLab, Azure DevOps, etc.).

Most providers prompt for a single PAT. Bitbucket Cloud uses a username + app-password pair (it doesn't support PATs the same way). Each credential is keyed by `(provider, host)` so you can have separate logins for, say, gitlab.com and a self-hosted GitLab without them stepping on each other.

### `agentpull auth logout`
Remove stored credentials for a git host.

- `--provider <id>` — `github`, `gitlab`, `bitbucket`, or `azure`. If omitted, you're prompted to pick.
- `--host <host>` — override the default host (for self-hosted instances).

```sh
agentpull auth logout --provider github                 # clear github.com credentials
agentpull auth logout --provider gitlab --host gitlab.example.com   # self-hosted
```

For the `github` provider, this also clears any legacy `github-pat-{host}` entry written by older agentpull versions.

### `agentpull audit`
Show the append-only audit log at `~/.agentpull/audit.log`.

- `--limit <n>` — most recent N entries
- `--operation <op>` — filter by `add` / `update` / `remove` / `scan` / `auth`

### `agentpull cache`
Manage the local tarball cache at `~/.agentpull/cache/`.

```sh
agentpull cache list     # show cached tarballs with sizes
agentpull cache clear    # delete every cached tarball
```

The cache is keyed by `provider-host-owner-repo-<commitSha>` so different commits and different hosts never collide. You rarely need to touch it — `agentpull update --force` evicts the relevant entry on its own. Use `cache clear` only if you want to wipe everything (e.g. to free disk space or recover from a manually-corrupted entry). The generic `git` provider doesn't use the tarball cache (each install is a fresh shallow clone).

### `agentpull config`
View and edit the global defaults stored in `~/.agentpull/config.json`.

```sh
agentpull config list                          # show all defaults
agentpull config get autoScan                  # print one value
agentpull config set autoScan true             # turn the scanner on by default
agentpull config set conflictResolution skip   # never overwrite existing files
agentpull config unset autoScan                # reset to built-in default (false)
```

Valid keys:
- `autoScan` — boolean. When `true`, every `agentpull add` / `update` runs the security scanner without needing `--scan`.
- `conflictResolution` — `prompt` | `skip` | `overwrite`. What to do when an upstream file would clobber an existing local file.

Values are validated against the same Zod schema used to load the file, so an invalid enum or wrong type is rejected before it touches disk. The file is rewritten atomically with mode `0o600`.

### `agentpull registry add [url]`
Register a repository from any supported host under a short name.

- `-n, --name <name>` — short name (defaults to repo or last subdir segment)
- `-r, --ref <ref>` — default branch or tag
- `-p, --provider <id>` — force a provider (`github`, `gitlab`, `bitbucket`, `azure`, `git`). Useful for self-hosted instances and the generic git fallback.
- `--host <host>` — override the host (for self-hosted instances).

The provider is auto-detected from the URL when possible. The `git` provider is never auto-selected for ambiguous URLs — use `--provider git` (or a `*.git` / `git://` / `git@host:owner/repo` URL) to force it.

**Interactive mode**: run `agentpull registry add` with no URL and you'll be walked through provider → host (if self-hosted) → URL → ref → name in a clack flow. Same questions as the `wizard` command, minus the auth + install steps.

### `agentpull registry list`
List registered repos.

### `agentpull registry remove [name]`
Remove a registered repo. Does not touch already-installed files.

- `-y, --yes` — skip the confirmation prompt.

**Interactive mode**: run `agentpull registry remove` with no name and you'll get a picker listing every registered repo with its URL.

## URL formats

`agentpull` auto-detects the provider from the URL. All of these are accepted wherever a repo URL is expected.

**GitHub** (default for bare `owner/repo` shorthand):

```
owner/repo
github.com/owner/repo
https://github.com/owner/repo
owner/repo/subdir
owner/repo/subdir#ref
github.com/owner/repo/deep/nested/subdir#main
```

**GitLab** (cloud + self-hosted; supports nested subgroups):

```
https://gitlab.com/group/project
https://gitlab.com/group/subgroup/project
https://gitlab.com/group/sub/sub/project
https://gitlab.example.com/team/project       # self-hosted
https://gitlab.com/group/project/-/tree/main/configs   # picks ref + subdir from the UI URL
https://gitlab.com/group/project#v1.2.0
```

**Bitbucket Cloud**:

```
https://bitbucket.org/workspace/repo
https://bitbucket.org/workspace/repo/src/main/configs   # picks ref + subdir
https://bitbucket.org/workspace/repo#develop
```

**Azure DevOps Repos** (the archive flow goes through `git clone` because there's no stable tarball API):

```
https://dev.azure.com/org/project/_git/repo
https://dev.azure.com/org/project/_git/repo?version=GBmain
https://org.visualstudio.com/project/_git/repo          # legacy host
```

**Generic git** (any host with a reachable `git` binary, requires `--provider git` or a recognisably git-shaped URL):

```
https://example.com/owner/repo.git
git://example.com/owner/repo.git
git@example.com:owner/repo.git
ssh://git@example.com/owner/repo.git
```

A subdir narrows the install to a single directory inside the repo — useful for monorepos of agent configs where `company/agents/project-a` and `company/agents/project-b` are independent.

## Sync model

`.agentpull.json` is a **pinned receipt**. Each installed entry records:

```jsonc
{
  "name": "team",
  "source": "https://github.com/company/agents",
  "ref": "main",
  "commitSha": "abc123…(40 hex)",
  "agentTypes": ["cursor", "copilot"],
  "files": [
    {
      "path": ".cursorrules",
      "sha256": "…64 hex…",
      "sourcePath": ".cursorrules"
    }
  ],
  "installedAt": "2026-04-10T…",
  "updatedAt": "2026-04-10T…"
}
```

- **`commitSha`** is resolved from the host's API (or `git rev-parse HEAD` for the generic git provider) at install time and pinned, so "same version" is a byte-exact question, not a guess.
- **`files[].sha256`** is the hash of the file as it landed on disk. `agentpull list` uses this to detect local edits.
- **`files[].sourcePath`** tracks upstream identity separately from local identity, so updates map upstream changes back to your files even if a handler rewrote the target path.

### Update reconciliation

`agentpull update`:

1. Resolves the manifest's `ref` to a fresh commit SHA via the host's API (or a fresh shallow clone for the generic git provider).
2. If it matches the manifest's pinned SHA → "already up to date", no-op (unless `--force`).
3. Otherwise downloads the tarball **by exact commit SHA** (not by ref name) so the host's CDN can never serve a stale archive — the tarball URL is content-addressed.
4. Builds an install plan from the new upstream files.
5. **Classifies every conflicting destination file** against the full project manifest:
   - *tracked-clean* — same path is in the entry's `files[]`, on-disk hash matches the recorded baseline → silent overwrite
   - *tracked-modified* — in the entry, but the on-disk hash differs (you edited it) → prompted, default skip
   - *tracked-other* — in a different entry's `files[]` → prompted, default skip
   - *hand-written* — not in any entry's `files[]` → prompted, default skip
6. Shows the SHA transition (`abc1234 → def5678`) so you can see what's actually moving.
7. Copies and re-hashes each non-skipped file. On any failure mid-loop, already-copied files are rolled back so the manifest and disk never drift.
8. Updates the manifest entry atomically.

The combination of points (3) and (5) is what makes `agentpull update` safe: the cache can never serve the wrong commit's content, and the wrong commit's content can never silently destroy work you didn't ask to be destroyed.

## Security

Layered, and mostly invisible when everything is fine.

### Credential storage (no native addons)

Credentials are stored in the OS keychain via platform CLIs:

- **macOS** — `security add-generic-password`
- **Linux** — `secret-tool store` (libsecret)
- **Windows** — PowerShell Credential Manager, with account/token passed via environment variables (never interpolated into the script string)

Each entry is keyed by `{provider}-pat-{host}` so logins for github.com, gitlab.com, a self-hosted GitLab, and Bitbucket all live side-by-side without collisions. Credentials that need a username + secret pair (Bitbucket Cloud app passwords) are JSON-serialized into the same entry. Tokens written by an older agentpull under the legacy `github-pat-{host}` key are read transparently and migrated on first use.

For the generic `git` provider, credentials are passed to `git clone` via a temporary `GIT_ASKPASS` helper script written to a 0700 directory — secrets never appear in argv, so they can't leak via `ps` or process audit logs.

### Tarball extraction

- Per-provider redirect allow-list. Each `HostProvider` declares which CDN hosts the downloader is allowed to follow a 302 to (e.g. `codeload.github.com`, `objects.githubusercontent.com` for GitHub; the host itself for GitLab/Azure; the bitbucket S3 bucket for Bitbucket). Cross-host redirects strip the `Authorization` header, so the credential never leaks to a CDN.
- Paths containing `..`, absolute paths, and symlinks in source entries are rejected before extraction.
- Commit SHAs returned by every provider's API are validated to match `^[a-f0-9]{40}$` before being used as cache keys.
- Tarballs are downloaded to a `.tmp` path and atomically renamed, so a killed process never leaves a half-written cache file.
- **Tar bomb protection**: extraction is bounded to 500 MB uncompressed and 10,000 entries, so a 1 MB compressed archive cannot expand to gigabytes.

### Content scanner (opt-in, `--scan`)

Four rules run against downloaded files, only when you pass `--scan` or set `autoScan true` via `agentpull config set autoScan true`:

- **Shell injection** — backticks, `$()`, `execSync(`, `spawn(`, `child_process`, `os.system(`, `subprocess.*(`, `eval(`
- **Env exfiltration** — `process.env`, `os.environ`, `getenv(`, references to sensitive shell vars (`$TOKEN`, `$SECRET`, `$API_KEY`, `$DATABASE_URL`, …), HTTP transmission of env vars
- **Prompt injection** — "ignore previous instructions", DAN-mode jailbreaks, hidden unicode (zero-width / BOM / direction-override), long base64 blobs (warning)
- **Embedded secrets** — GitHub PATs, AWS keys, OpenAI / Anthropic keys, JWTs, Slack tokens, private keys

**Rules are scoped by file type** so they don't fire on unrelated content:
- *Shell injection* and *env exfiltration* only run on actual code/config files (`.sh`, `.bash`, `.js`, `.ts`, `.py`, `.rb`, `.yml`, `Dockerfile`, …). Backtick `` `npm install` `` in a markdown doc is not flagged.
- *Prompt injection* only runs on text files (`.md`, `.mdc`, `.txt`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, …). A `IGNORE_PREVIOUS` constant in JS is not flagged.
- *Embedded secrets* runs on every file. A leaked PAT is bad anywhere.

Files over 1 MB and files containing NUL bytes are skipped, so the scanner can't be OOM'd or CPU-burned by large or binary files. Critical findings block installation.

### Manifest and logs

- `.agentpull.json` rejects any file path containing `..` or an absolute prefix at the Zod-schema level.
- `~/.agentpull/config.json` is written with mode `0o600` (owner read/write only).
- `~/.agentpull/audit.log` is append-only, opened with mode `0o600`, and every append `chmod`s back to `0o600` to tighten any pre-existing loose file.

## File layout

Per-project:

```
.agentpull.json   # install manifest (pinned receipt)
```

Global, under `~/.agentpull/`:

```
config.json   # registries + defaults
cache/        # tarballs keyed by owner-repo-commitSha
audit.log     # append-only, 0o600
```

### Global config

```jsonc
{
  "version": 1,
  "registries": [
    {
      "name": "team",
      "url": "https://github.com/company/agents",
      "subdir": "project-a",
      "defaultRef": "main"
    },
    {
      "name": "internal",
      "url": "https://gitlab.example.com/team/agents",
      "provider": "gitlab",        // optional — auto-detected from the URL when omitted
      "host": "gitlab.example.com",// optional — overrides the host (self-hosted instances)
      "defaultRef": "main"
    }
  ],
  "defaults": {
    "conflictResolution": "prompt",   // "prompt" | "skip" | "overwrite"
    "autoScan": false                 // set to true to always scan
  }
}
```

## Publishing an agents repository

If you're on the other side of this tool — building a repo *for* consumers to install from — the key rule is: **files in your repo go to the same relative path in the consumer's project.** Every handler's `getTargetPath(sourcePath)` returns `sourcePath` unchanged, so a file at `./.cursorrules` in your repo lands at `./.cursorrules` in the consumer's project. Design your repo as if you're looking at a consumer's project root.

Two patterns, depending on how many independent config sets you ship.

### Pattern A — single config set (flat repo)

Best when the repo exists to serve one team or one standard. Consumers install with `agentpull add owner/repo`.

```
my-agents/
├── README.md                              # docs for consumers, NOT installed
├── LICENSE
├── AGENTS.md                              # cross-agent standard (Copilot + Claude + Antigravity)
├── CLAUDE.md                              # Claude Code specific
├── GEMINI.md                              # Antigravity overrides (takes precedence over AGENTS.md)
├── .cursorrules                           # Cursor (legacy single-file)
├── .windsurfrules                         # Windsurf (legacy single-file)
├── .clinerules                            # Cline (single-file form)
├── .cursor/                               # Cursor (directory form)
│   ├── rules/
│   │   ├── typescript.mdc
│   │   └── testing.mdc
│   ├── commands/
│   │   └── review.md
│   └── agents/
│       └── doc-writer.md
├── .windsurf/                             # Windsurf (directory form)
│   ├── rules/
│   │   └── style.md
│   └── workflows/
│       └── deploy.md
├── .claude/
│   ├── commands/
│   │   └── review.md
│   ├── agents/
│   │   └── code-reviewer.md
│   └── skills/
│       └── migration/
│           └── SKILL.md
├── .agent/                                # Antigravity rules / skills / workflows
│   └── rules/
│       └── style.md
├── .continue/                             # Continue.dev
│   ├── config.yaml
│   ├── rules/
│   │   └── style.md
│   └── checks/
│       └── lint.md
├── .github/
│   ├── copilot-instructions.md            # repo-wide Copilot
│   ├── instructions/
│   │   └── api.instructions.md            # path-scoped Copilot
│   ├── prompts/
│   │   └── refactor.prompt.md             # reusable prompts
│   ├── agents/
│   │   └── reviewer.agent.md              # custom agent personas
│   └── skills/
│       └── migration/
│           └── SKILL.md
├── .agents/                               # cross-agent skills standard
│   └── skills/
│       └── test-writer/
│           └── SKILL.md
├── .vscode/
│   └── agents/
│       └── architect.md
└── .aider.conf.yml                        # Aider
```

A consumer running `agentpull add my-agents` sees each handler fire on its patterns and is asked to pick which agent types to install. They can also narrow with `--agent cursor,claude` or install everything.

**The repo root doubles as a consumer's project root.** Don't wrap your configs in `configs/` or `src/` — that would install them at `configs/.cursorrules`, which is useless.

### Pattern B — monorepo of config sets

Best when you ship several independent profiles (per-team, per-stack, per-tier). Consumers install with `agentpull add owner/repo/subdir`.

```
company-agents/
├── README.md
├── LICENSE
├── backend-typescript/                    # consumed as owner/repo/backend-typescript
│   ├── README.md                          # per-profile docs
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   ├── .cursorrules
│   └── .github/
│       ├── copilot-instructions.md
│       └── instructions/
│           └── express.instructions.md
├── frontend-react/                        # consumed as owner/repo/frontend-react
│   ├── README.md
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   └── .cursor/
│       └── rules/
│           └── hooks.mdc
├── data-python/                           # consumed as owner/repo/data-python
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   └── .aider.conf.yml
└── shared/                                # deep nesting also works
    └── security/                          # consumed as owner/repo/shared/security
        ├── AGENTS.md
        └── .github/
            └── instructions/
                └── secrets.instructions.md
```

`agentpull` extracts only the selected subdir and flattens it to the project root, so **inside each subdir you still use the flat-repo layout**. The subdir name becomes the default install short-name (`backend-typescript`, `data-python`, …).

Register with:

```sh
agentpull registry add github.com/company/company-agents/backend-typescript --name be
agentpull add be
```

Or inline: `agentpull add company/company-agents/backend-typescript`.

### Recommendations

- **Always ship `AGENTS.md`.** It's the emerging cross-agent standard and is picked up by Copilot, Claude Code, and Antigravity simultaneously. Start there, then add agent-specific files (`CLAUDE.md`, `.cursorrules`, `GEMINI.md`) only where you need to override or extend.
- **Version with Git tags.** Consumers pin via `agentpull add owner/repo#v1.2.0`. The commit SHA is what actually gets stored in the manifest, so tags are just human-readable handles. Moving a tag breaks cache assumptions — prefer new tags over force-pushing.
- **Don't rely on branch names for stability.** `agentpull update` detects that `main` moved and re-installs; if your `main` changes daily you'll annoy consumers. Cut releases.
- **Put consumer-facing docs in `README.md`**, not in `AGENTS.md`. `AGENTS.md` is installed into the consumer's repo and becomes *their* `AGENTS.md` — it shouldn't explain your repo, it should tell the agent how to work on the consumer's code.
- **Keep the repo free of unrelated source code.** A subdir of `src/node_modules/**` won't match any handler, but it bloats the tarball. If you need tests or scaffolding, keep them in separate top-level directories and make sure no top-level file matches an agent pattern by accident.
- **Nothing at the root should double as real code.** A real `.aider.conf.yml` wired to live OpenAI credentials would be copied into every consumer's repo. Use placeholders or commit deliberately-safe defaults.
- **Check before you tag.** Run `agentpull scan .` on your own repo before releasing. Consumers scan opt-in, but a maintainer who catches issues pre-release is a good maintainer.
- **`AGENTS.md` vs agent-specific files**: if the guidance is the same for all agents, put it in `AGENTS.md` and nowhere else. If Claude needs a different rule than Copilot, put the delta in `CLAUDE.md` / `.github/copilot-instructions.md`. Antigravity's `GEMINI.md` overrides `AGENTS.md` for that agent specifically.

## Development

```sh
npm install
npm run build       # tsup bundle
npm test            # vitest (330 tests)
npm run typecheck   # tsc --noEmit
npm run dev         # tsup --watch
```

Project layout:

```
src/
  cli.ts              # commander entry
  commands/           # one file per CLI command (init, wizard, add, update, …)
  core/               # installer, downloader, manifest, registry, differ
  hosts/              # one file per host provider (github, gitlab, bitbucket, azure, git)
  agents/             # one handler per supported agent + detector + registry
  security/           # scanner, rules, integrity, keychain, audit log
  utils/              # errors, fs, hash, logger, prompts
  types/              # zod schemas for manifest + config
test/                 # vitest, one file per module (incl. test/hosts/)
bin/agentpull.ts          # shebang entry, calls src/cli.ts:run()
```

Adding a new host provider is an isolated change: drop a file under `src/hosts/`, register it in `src/hosts/index.ts`, and the rest of the system picks it up automatically.

The CLI version is read from `package.json` at build time via tsup's `define`, so bumping a release is a single-file change.

## Releases

Releases are automated via `.github/workflows/publish.yml`. Tag is the source of truth — push `vX.Y.Z` and the workflow takes it from there.

To cut a release:

1. Bump `version` in `package.json` (e.g. `0.2.0`) and commit on `main`.
2. Tag the commit: `git tag v0.2.0`
3. Push the tag: `git push origin v0.2.0`
4. Watch the `publish` workflow in the Actions tab.

The workflow:

- **Verifies** the pushed tag matches `package.json`'s `version` (mismatch → fails fast with a recovery hint).
- **Re-runs the full test matrix** (Ubuntu/macOS/Windows × Node 20/22, 6 cells) via `workflow_call` reuse of `test.yml`.
- **Publishes to npm** with provenance via [Trusted Publisher](https://docs.npmjs.com/trusted-publishers) (OIDC, no `NPM_TOKEN` secret).
- **Creates a GitHub Release** for the same tag with auto-generated notes (PRs since the previous tag) and the built `agentpull-X.Y.Z.tgz` attached as a downloadable artifact.

Tags matching `-rc`, `-beta`, or `-alpha` (e.g. `v0.2.0-rc.1`) are marked as prereleases and don't bump the npm `latest` dist-tag.

### Bad-tag recovery

If `verify-version` fails because you tagged before bumping `package.json`:

```sh
git tag -d v0.2.0                          # delete locally
git push origin :refs/tags/v0.2.0          # delete on the remote
# … bump package.json, commit, then re-tag and re-push.
```

### One-time setup (before the first automated release)

These steps must happen once by hand. Future releases are pure tag pushes.

1. **Bootstrap the npm package.** Trusted Publisher cannot create a brand-new package — the name must already exist. For the very first publish, run locally:

   ```sh
   npm login
   npm publish --access public
   ```

2. **Configure Trusted Publisher** on `npmjs.com` → package settings → *Publishing access* → *Trusted Publishers* → add a GitHub Actions publisher with:
   - Organization/user: `<your-gh-owner>`
   - Repository: `agentpull`
   - Workflow filename: `publish.yml` (exact name, no path)
   - Environment: leave blank

3. **Allow OIDC at the repo level**: GitHub repo → Settings → Actions → General → *Workflow permissions* → enable read/write.

After this, every subsequent `git push origin vX.Y.Z` cuts a fully signed, provenance-attested release with zero secrets.

## License

MIT — see `LICENSE`.
