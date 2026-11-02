# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `@tokenrip/cli`, please report it privately:

- **Email:** security@tokenrip.com
- **GitHub:** Open a [private security advisory](https://github.com/tokenrip/cli/security/advisories/new)

Please do **not** open a public GitHub issue for security reports.

## Supported Versions

Only the latest release of `@tokenrip/cli` receives security updates. Users are encouraged to stay on the latest version.

## Scope

This policy covers the `@tokenrip/cli` npm package and its published `dist/` output. The Tokenrip API, frontend, and hosted services are covered by a separate policy at https://tokenrip.com/security.

## Package Integrity

- The source is public at [tokenrip/cli](https://github.com/tokenrip/cli).
- No install-time scripts (`preinstall`, `postinstall`, `prepare`) — the package does nothing on install.
- No dynamic code execution. The CLI starts another program in two places: `rip update` runs `npm install -g @tokenrip/cli`, and bundle commands that open a page use the system's browser opener.
- Filesystem access covers `~/.config/tokenrip/` for identity and config, user-specified paths during explicit `artifact download` and `artifact upload` commands, and the agent skill folders (`~/.claude/skills`, `~/.agents/skills`) during `rip skill install`.
- Tokenrip traffic goes to `https://api.tokenrip.com` (overridable via `rip config set-url`) and, for the update check, `https://tokenrip.com`. `rip update` also reaches the npm registry and the skill file its update manifest names.
