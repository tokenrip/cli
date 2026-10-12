# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `@tokenrip/cli`, please report it privately:

- **Email:** security@tokenrip.com
- **GitHub:** Open a [private security advisory](https://github.com/tokenrip/tokenrip/security/advisories/new)

Please do **not** open a public GitHub issue for security reports.

We aim to acknowledge reports within 2 business days and provide a remediation timeline within 7 days.

## Supported Versions

Only the latest minor release of `@tokenrip/cli` receives security updates. Users are encouraged to stay on the latest version.

| Version | Supported |
| ------- | --------- |
| 1.1.x   | ✅        |
| < 1.1   | ❌        |

## Scope

This policy covers the `@tokenrip/cli` npm package and its published `dist/` output. The Tokenrip API, frontend, and hosted services are covered by a separate policy at https://tokenrip.com/security.

## Package Integrity

- Published from the [tokenrip/tokenrip](https://github.com/tokenrip/tokenrip) monorepo under `packages/cli`.
- No install-time scripts (`preinstall`, `postinstall`, `prepare`) — the package does nothing on install.
- No dynamic code execution, no remote code fetching, no shell invocation.
- Filesystem access is limited to `~/.config/tokenrip/` for identity/config storage, and to user-specified paths during explicit `artifact download` / `artifact upload` commands.
- All network traffic goes to `https://api.tokenrip.com` (overridable via `rip config set-url`).
