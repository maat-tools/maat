# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities using [GitHub's private vulnerability reporting](https://github.com/maat-tools/maat/security/advisories/new). Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any proof-of-concept code

You can expect an acknowledgement within 72 hours and a resolution timeline within 7 days of confirmation.

## Scope

Maat is a local CLI that collects facts from configured sources, evaluates configured rules, and optionally writes to a ledger file. It does not run a server. When LLM enrichers are configured, a check can send collected code information to external providers using the user's credentials. Cached responses can avoid repeated calls; missing entries or `--no-cache` can cause new requests. Review the provider configuration and the facts an enricher sends before using it with sensitive code.

The primary attack surface is:

- Malicious `maat.config.ts` files (arbitrary code execution via the config loader)
- Malicious input to collectors (crafted source files, git history, or other data sources designed to exploit parsers)
- Ledger file manipulation (tampering with the append-only event log)
- Third-party plugins, which execute code in the CLI process without a permission sandbox
- External LLM requests and local caches, which may contain source-derived information; protect credentials and review cached data before sharing or committing it

Out of scope: issues in third-party dependencies that are not exploitable through maat's public interfaces.
