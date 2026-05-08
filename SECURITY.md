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

maat is a static analysis CLI that reads source files and writes to a local ledger file. It does not run a server, handle network requests, or store credentials. The primary attack surface is:

- Malicious `maat.config.ts` files (arbitrary code execution via the config loader)
- Malicious source files crafted to exploit the TypeScript AST parser

Out of scope: issues in third-party dependencies that are not exploitable through maat's public interfaces.
