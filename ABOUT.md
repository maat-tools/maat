# About Maat

Maat is a fact-based architecture analysis tool for TypeScript codebases.

It works by collecting repository facts, applying deterministic rules, and reporting findings with stable fingerprints. Accepted exceptions are stored in version control so architecture decisions can be tracked over time.

Maat is designed for architectural governance, not as a linter or AI review tool. Its core goal is to make architecture intent explicit and executable in code, while letting teams decide how to resolve violations.

Key concepts:

- Collectors extract facts from the repository.
- Rules evaluate facts against architectural boundaries.
- Findings are reported with stable identifiers.
- A ledger records accepted decisions and exceptions.

For usage and configuration, see `README.md`.
