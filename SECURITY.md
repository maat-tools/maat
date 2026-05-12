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

maat is a local CLI that collects facts from configured sources, evaluates deterministic rules, and writes to a ledger file. It does not run a server, handle network requests during the check path, or store credentials. The primary attack surface is:

- Malicious `maat.config.ts` files (arbitrary code execution via the config loader)
- Malicious input to collectors (crafted source files, git history, or other data sources designed to exploit parsers)
- Ledger file manipulation (tampering with the append-only event log)

Out of scope: issues in third-party dependencies that are not exploitable through maat's public interfaces.
