#!/usr/bin/env bash
#
# Packed-artifact smoke test.
#
# Packs every publishable package exactly as the release workflow does (version
# rewritten, workspace:* deps pinned), installs the resulting tarballs into a
# throwaway consumer, and runs the CLI against a fixture under BOTH Node and Bun.
#
# This exists because `bun run maat` and the unit/e2e suites all run the TypeScript
# `src` under Bun. Real users install the bundled `dist` and run it under Node, and
# a whole class of bugs only appears there:
#   - Node-missing engine APIs (e.g. Map.prototype.getOrInsert — Bun has it, Node 24 doesn't)
#   - bundler-duplicated singletons breaking identity checks (Pure layers degrading silently)
#   - missing dist files / broken export subpaths / a ledger dir never created
#
# The strongest assertion here is that Node and Bun produce the *same* finding
# fingerprints: any dist-vs-src divergence (like the Pure-identity bug) breaks it.
#
# Requires: bun, node, npm, jq (all present on GitHub ubuntu runners).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="0.0.0-smoke"
PKGS=(contracts vocabulary utils core kernel collector-ts collector-git enricher-llm \
      coupling-rules connascence-rules presets-ts git-rules insights file-ledger cli)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
TARBALLS="$WORK/tarballs"; mkdir -p "$TARBALLS"
CONSUMER="$WORK/consumer"; mkdir -p "$CONSUMER/packages/widgets/src"

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "==> building packages"
bun run build

echo "==> packing all packages @ $VERSION (staged, working tree untouched)"
for pkg in "${PKGS[@]}"; do
  src="packages/$pkg"
  stage="$WORK/stage/$pkg"
  mkdir -p "$stage"
  [ -d "$src/dist" ] && cp -r "$src/dist" "$stage/dist"
  [ -d "$src/src" ] && cp -r "$src/src" "$stage/src"
  cp LICENSE "$stage/LICENSE"
  jq --arg v "$VERSION" '
    .version = $v
    | if .dependencies     then .dependencies     = (.dependencies     | map_values(if type=="string" and startswith("workspace:") then $v else . end)) else . end
    | if .peerDependencies then .peerDependencies = (.peerDependencies | map_values(if type=="string" and startswith("workspace:") then $v else . end)) else . end
  ' "$src/package.json" > "$stage/package.json"
  ( cd "$stage" && npm pack --silent --pack-destination "$TARBALLS" >/dev/null 2>&1 )
done

echo "==> generating consumer that installs every tarball"
node -e '
  const fs = require("fs"), path = require("path");
  const dir = process.argv[1];
  const deps = {};
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^maat-tools-(.+)-0\.0\.0-smoke\.tgz$/);
    if (m) deps["@maat-tools/" + m[1]] = "file:" + path.join(dir, f);
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(
    { name: "maat-pack-smoke", private: true, type: "module", dependencies: deps }, null, 2));
' "$TARBALLS" "$CONSUMER/package.json"

# Fixture is a tiny named package (collector-ts tags facts by package name, so the
# Pure layer must target a real package). It exercises two rule families:
#   - cop-args  : >3 params incl. a boolean
#   - Pure layer: an external import in a package declared Pure — guards the identity
#                 bug, since Pure is imported from /roles and layer from /layer
cat > "$CONSUMER/packages/widgets/package.json" <<'EOF'
{ "name": "@smoke/widgets", "version": "1.0.0", "private": true, "type": "module" }
EOF

cat > "$CONSUMER/packages/widgets/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ESNext", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "skipLibCheck": true, "types": []
  },
  "include": ["src/**/*.ts"]
}
EOF

cat > "$CONSUMER/packages/widgets/src/index.ts" <<'EOF'
import { join } from 'node:path';

export function createUser(name: string, email: string, age: number, isAdmin: boolean, country: string) {
  return join(name, email, String(age), String(isAdmin), country);
}
EOF

cat > "$CONSUMER/maat.config.ts" <<'EOF'
import { defineConfig, rule } from '@maat-tools/core';
import { Pure } from '@maat-tools/coupling-rules/roles';
import { layer } from '@maat-tools/coupling-rules/layer';

export default defineConfig({
  check: { strict: true },
  collectors: [
    ['@maat-tools/collector-ts', { tsConfigFilePath: './packages/*/tsconfig.json', exclude: ['**/node_modules/**'] }],
  ],
  rules: [
    rule('@maat-tools/connascence-rules/cop-args', { flagBoolean: true, maxArgumentsAllowed: 3 }),
    // Pure imported from /roles, layer from /layer: under a broken Node build these
    // resolve to different inlined Pure copies and this degrades to a layer-imports rule.
    layer('@smoke/widgets').is(Pure).build(),
  ],
  ledger: ['@maat-tools/file-ledger', { path: './.maat/ledger.ndjson' }],
});
EOF

echo "==> installing tarballs into consumer"
( cd "$CONSUMER" && npm install --no-audit --no-fund --silent )

CLI="node_modules/@maat-tools/cli/dist/index.js"
fingerprints() { grep -oE '^    [0-9a-f]{64}' "$1" | sort -u; }

cd "$CONSUMER"

# --- Node ---
echo "==> running under Node"
set +e
node "$CLI" check > node_check.log 2>&1; node_check_rc=$?
node "$CLI" visualize > node_viz.log 2>&1; node_viz_rc=$?
node "$CLI" check --ledger > node_ledger.log 2>&1
set -e

[ "$node_check_rc" -eq 1 ] || { cat node_check.log; fail "node check expected exit 1 (findings), got $node_check_rc"; }
[ "$node_viz_rc" -eq 0 ] || { cat node_viz.log; fail "node visualize crashed (exit $node_viz_rc) — likely a Node-missing API"; }
grep -q "is not a function" node_viz.log && { cat node_viz.log; fail "node visualize hit a missing API"; }
grep -q "not allowed for a Pure layer" node_check.log || { cat node_check.log; fail "Pure layer did not produce a pure-imports finding under Node (identity/bundling regression)"; }
[ -f .maat/ledger.ndjson ] || fail "ledger file not written by 'check --ledger' (missing mkdir?)"

# --- Bun ---
echo "==> running under Bun"
rm -rf .maat
set +e
bun "$CLI" check > bun_check.log 2>&1; bun_check_rc=$?
bun "$CLI" visualize > bun_viz.log 2>&1; bun_viz_rc=$?
set -e

[ "$bun_check_rc" -eq 1 ] || { cat bun_check.log; fail "bun check expected exit 1 (findings), got $bun_check_rc"; }
[ "$bun_viz_rc" -eq 0 ] || { cat bun_viz.log; fail "bun visualize crashed (exit $bun_viz_rc)"; }

# --- cross-runtime determinism (the key invariant) ---
echo "==> comparing Node vs Bun fingerprints"
if ! diff <(fingerprints node_check.log) <(fingerprints bun_check.log) >/dev/null; then
  echo "--- only in Node ---"; comm -23 <(fingerprints node_check.log) <(fingerprints bun_check.log)
  echo "--- only in Bun  ---"; comm -13 <(fingerprints node_check.log) <(fingerprints bun_check.log)
  fail "Node and Bun produced different finding fingerprints (dist vs src divergence)"
fi

echo "==> SMOKE PASS: $(fingerprints node_check.log | wc -l | tr -d ' ') findings, identical across Node and Bun"
