import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// The deployment scripts only ever run on Linux, but their validation and code-swap logic is
// plain POSIX shell, so it is exercised here with whatever bash is available (Git Bash on Windows).
const bashAvailable = spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0;
const shellcheckAvailable = bashAvailable
  && spawnSync('bash', ['-c', 'command -v shellcheck'], { encoding: 'utf8' }).status === 0;

const bash = (script, env = {}) => spawnSync('bash', ['-c', script], {
  cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ...env }
});
const sourced = script => bash(`set -u; . scripts/lib.sh\n${script}`);
// Values are passed as single-quoted shell literals so hostile samples are never expanded.
const accepts = (validator, value) => sourced(`${validator} '${value}'`).status === 0;

test('shell validators accept valid deployment values', { skip: !bashAvailable }, () => {
  for (const value of ['100', '101', '999999']) assert.ok(accepts('ial_valid_ctid', value), value);
  for (const value of ['1', '3000', '65535']) assert.ok(accepts('ial_valid_port', value), value);
  for (const value of ['vmbr0', 'vmbr1', 'br-lan']) assert.ok(accepts('ial_valid_bridge', value), value);
  for (const value of ['local', 'local-lvm', 'nas_01']) assert.ok(accepts('ial_valid_storage', value), value);
  for (const value of ['dhcp', '192.168.1.50/24', '10.0.0.1/8']) assert.ok(accepts('ial_valid_ipv4_config', value), value);
  for (const value of ['latest', 'v0.5.0', '0.5.0', 'v1.0.0-rc.1']) assert.ok(accepts('ial_valid_version', value), value);
  for (const value of ['main', 'feature/installer']) assert.ok(accepts('ial_valid_branch', value), value);
  for (const value of ['inventory-atlas-lite', 'atlas']) assert.ok(accepts('ial_valid_hostname', value), value);
});

test('shell validators reject unusable or injected values', { skip: !bashAvailable }, () => {
  for (const value of ['99', '0', '', 'abc', '1e5', '10 0', '100; reboot']) {
    assert.ok(!accepts('ial_valid_ctid', value), `CTID ${value}`);
  }
  for (const value of ['0', '65536', '-1', '3000abc', '']) assert.ok(!accepts('ial_valid_port', value), `port ${value}`);
  for (const value of ['', 'vmbr0; rm -rf /', 'vmbr0 vmbr1', '$(id)', '../vmbr0']) {
    assert.ok(!accepts('ial_valid_bridge', value), `bridge ${value}`);
  }
  for (const value of ['', '-local', 'local lvm', 'local;id']) assert.ok(!accepts('ial_valid_storage', value), `storage ${value}`);
  for (const value of ['', 'static', '999.1.1.1/24', '192.168.1.50', '192.168.1.50/33', '192.168.1.50/24;id']) {
    assert.ok(!accepts('ial_valid_ipv4_config', value), `ipv4 ${value}`);
  }
  for (const value of ['', 'main', 'v1.0', 'v1.0.0; id', '../../etc/passwd', 'v1.0.0/../x']) {
    assert.ok(!accepts('ial_valid_version', value), `version ${value}`);
  }
  for (const value of ['', '../main', 'feature/../../x', '-main', 'main;id', 'main branch']) {
    assert.ok(!accepts('ial_valid_branch', value), `branch ${value}`);
  }
  for (const value of ['', 'Atlas_Host', 'host.name', '-atlas']) assert.ok(!accepts('ial_valid_hostname', value), `hostname ${value}`);
  for (const value of ['3', '0', '4096', 'x']) {
    assert.notEqual(sourced(`ial_valid_int '${value}' 4 2048`).status, 0, `disk ${value}`);
  }
});

test('every script documents itself without changing anything', { skip: !bashAvailable }, () => {
  const treeState = () => bash('git status --porcelain --untracked-files=all scripts deploy').stdout;
  const before = treeState();
  for (const script of ['proxmox-install.sh', 'install.sh', 'update.sh']) {
    const help = bash(`bash scripts/${script} --help`);
    assert.equal(help.status, 0, `${script} --help exited ${help.status}`);
    assert.match(help.stdout, /^Usage: /m, `${script} --help printed no usage`);
  }
  assert.equal(treeState(), before, 'running --help changed the working tree');
});

test('scripts refuse to run outside their expected context', { skip: !bashAvailable }, () => {
  // A stub "id" makes the root check pass so the context checks behind it can be reached.
  const asRoot = `stub=$(mktemp -d); printf '#!/bin/sh\\necho 0\\n' >"$stub/id"; chmod +x "$stub/id"; export PATH="$stub:$PATH";`;

  const host = bash(`${asRoot} bash scripts/proxmox-install.sh --yes`);
  assert.notEqual(host.status, 0, 'the host installer ran outside Proxmox VE');
  assert.match(host.stderr, /Proxmox VE host/);

  const orphan = bash(`${asRoot} work=$(mktemp -d); cp scripts/install.sh "$work/"; bash "$work/install.sh"`);
  assert.notEqual(orphan.status, 0, 'the container installer ran without its library');
  assert.match(orphan.stderr, /lib\.sh is missing/);

  const noInstall = bash(`${asRoot} bash scripts/update.sh`, { IAL_LIB: '/nonexistent/lib.sh' });
  assert.notEqual(noInstall.status, 0, 'the updater ran without an installation');
  assert.match(noInstall.stderr, /Is Inventory Atlas Lite installed here/);
});

test('persistent data lives outside the replaceable application directory', { skip: !bashAvailable }, () => {
  const paths = sourced('printf "%s\\n%s\\n%s\\n%s\\n" "$IAL_APP_ROOT" "$IAL_APP_DIR" "$IAL_DATA_DIR" "$IAL_BACKUP_DIR"');
  const [appRoot, appDir, dataDir, backupDir] = paths.stdout.trim().split('\n');
  assert.equal(appDir.startsWith(`${appRoot}/`), true);
  assert.equal(dataDir.startsWith(`${appRoot}/`), false, 'the data directory is inside the replaceable code directory');
  assert.equal(backupDir.startsWith(`${dataDir}/`), true, 'update backups are not kept with the data');
  assert.equal(appDir.startsWith(`${dataDir}/`), false);
});

test('a failed update restores the previous code and keeps the data', { skip: !bashAvailable }, () => {
  // ial_install_code and ial_rollback_code are what the updater uses around its health check.
  const result = sourced(`
    root=$(mktemp -d)
    IAL_APP_ROOT="$root/opt"
    IAL_APP_DIR="$IAL_APP_ROOT/app"
    IAL_DATA_DIR="$root/var"
    mkdir -p "$IAL_APP_DIR" "$IAL_DATA_DIR"
    echo old >"$IAL_APP_DIR/marker"
    echo records >"$IAL_DATA_DIR/inventory.sqlite"
    staging=$(mktemp -d "$IAL_APP_ROOT/.staging.XXXXXX")
    echo new >"$staging/marker"
    ial_install_code "$staging"
    echo "after-update=$(cat "$IAL_APP_DIR/marker")"
    ial_rollback_code || echo "rollback-failed"
    echo "after-rollback=$(cat "$IAL_APP_DIR/marker")"
    echo "data=$(cat "$IAL_DATA_DIR/inventory.sqlite")"
    echo "staging-left=$(ls -1 "$IAL_APP_ROOT" | tr '\\n' ' ')"
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /after-update=new/);
  assert.match(result.stdout, /after-rollback=old/);
  assert.match(result.stdout, /data=records/);
  assert.equal(result.stdout.includes('rollback-failed'), false);
  assert.match(result.stdout, /staging-left=app\s*$/m, 'the swap left directories behind');
});

test('shell scripts pass shellcheck', { skip: !shellcheckAvailable }, () => {
  const result = bash('shellcheck --shell=bash --external-sources scripts/*.sh');
  assert.equal(result.status, 0, result.stdout || result.stderr);
});
