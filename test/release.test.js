import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: process.cwd(), encoding: 'utf8', ...options
});

test('release version validator accepts only the committed stable version', () => {
  // Taken from package.json so a normal version bump does not need this test edited.
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const valid = run(process.execPath, ['scripts/validate-release-version.mjs', `v${version}`]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, version);

  for (const tag of [version, 'v0.8', `v${version}.1`, `v${version}-beta.1`, 'v01.2.3']) {
    const invalid = run(process.execPath, ['scripts/validate-release-version.mjs', tag]);
    assert.notEqual(invalid.status, 0, `${tag} unexpectedly passed`);
  }
});

test('release workflow gates both distributions and preserves the legacy asset contract', () => {
  const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8');
  assert.match(workflow, /tags:\s*\n\s*- 'v\*'/);
  assert.match(workflow, /docker:[\s\S]*needs: validate/);
  assert.match(workflow, /proxmox-assets:[\s\S]*needs: validate/);
  assert.match(workflow, /release:[\s\S]*needs: \[docker, proxmox-assets\]/);
  assert.match(workflow, /inventory-atlas-lite-v\$\{version\}\.tar\.gz/);
  assert.match(workflow, /sha256sum "\$archive" > SHA256SUMS/);
  assert.match(workflow, /git archive[\s\S]*--prefix="inventory-atlas-lite-v\$\{version\}\//);
  // The user-facing notes come from shared/release-history.json, and the tag is checked against it
  // in the validation job, so a release without an entry fails before anything is published.
  assert.match(workflow, /validate:[\s\S]*scripts\/release-notes\.mjs/);
  assert.match(workflow, /release-notes\.mjs "\$GITHUB_REF_NAME" > release-notes\.md[\s\S]*--notes-file release-notes\.md/);
  assert.doesNotMatch(workflow, /--generate-notes/);
});

test('Docker image runs as a non-root user with external data and traceable labels', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /DATA_DIR=\/data/);
  assert.match(dockerfile, /VOLUME \["\/data"\]/);
  for (const label of ['source', 'version', 'revision']) {
    assert.match(dockerfile, new RegExp(`org\\.opencontainers\\.image\\.${label}`));
  }
});

test('health polling can require the released application version', () => {
  if (run('bash', ['-c', 'exit 0']).status !== 0) return;
  const result = run('bash', ['-c', `
    set -u
    . scripts/lib.sh
    curl() { printf '%s' '{"status":"ok","database":"ok","version":"0.8.0"}'; }
    ial_wait_for_health http://example.invalid 1 0.8.0
    if ial_wait_for_health http://example.invalid 1 0.8.1; then exit 9; fi
  `]);
  assert.equal(result.status, 0, result.stderr);
});

test('the unmodified v0.7.0 helper accepts the release asset name, checksum and layout', () => {
  if (run('bash', ['-c', 'command -v tar >/dev/null && command -v sha256sum >/dev/null']).status !== 0) return;
  const result = run('bash', ['-c', `
    set -euo pipefail
    fixture=$(mktemp -d)
    trap 'rm -rf "$fixture"' EXIT
    git show v0.7.0:scripts/lib.sh > "$fixture/legacy-lib.sh"
    mkdir -p "$fixture/tree/inventory-atlas-lite-v0.8.0"
    cp package.json "$fixture/tree/inventory-atlas-lite-v0.8.0/package.json"
    tar -czf "$fixture/inventory-atlas-lite-v0.8.0.tar.gz" -C "$fixture/tree" inventory-atlas-lite-v0.8.0
    (cd "$fixture" && sha256sum inventory-atlas-lite-v0.8.0.tar.gz > SHA256SUMS)
    mkdir "$fixture/bin" "$fixture/work"
    cat > "$fixture/bin/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
url="\${*: -1}"
destination="\${*: -2:1}"
printf '%s\\n' "$url" >> "$FIXTURE_URLS"
case "$url" in
  */inventory-atlas-lite-v0.8.0.tar.gz) cp "$FIXTURE_ARCHIVE" "$destination" ;;
  */SHA256SUMS) cp "$FIXTURE_SUMS" "$destination" ;;
  *) exit 22 ;;
esac
STUB
    chmod +x "$fixture/bin/curl"
    export FIXTURE_ARCHIVE="$fixture/inventory-atlas-lite-v0.8.0.tar.gz"
    export FIXTURE_SUMS="$fixture/SHA256SUMS"
    export FIXTURE_URLS="$fixture/urls"
    PATH="$fixture/bin:$PATH"
    . "$fixture/legacy-lib.sh"
    extracted=$(ial_fetch_source tag v0.8.0 "$fixture/work")
    test -f "$extracted/package.json"
    grep -Fx 'https://github.com/bloschinsky/inventory-atlas-lite/releases/download/v0.8.0/inventory-atlas-lite-v0.8.0.tar.gz' "$FIXTURE_URLS"
  `]);
  assert.equal(result.status, 0, result.stderr);
});
