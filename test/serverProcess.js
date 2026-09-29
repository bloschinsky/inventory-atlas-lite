import { spawn } from 'node:child_process';

/*
  Starts the real server in a child process for the API tests. It listens on port 0, so the operating
  system picks a free port: a fixed test port can be taken by any socket of the test files running in
  parallel, which made the server exit on start. The port is read from the listening line, and the
  server's errors stay visible in the test output.
*/
export function startServer(dataDir, { environment = {}, args = [] } = {}) {
  const child = spawn(process.execPath, ['server/src/index.js', ...args], {
    cwd: process.cwd(), env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ...environment }, stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server did not become ready.')); }, 10000);
    const onExit = code => { clearTimeout(timer); reject(new Error(`Server exited before becoming ready (exit code ${code}).`)); };
    child.once('exit', onExit);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (output === null) return;
      output += chunk;
      const port = output.match(/listening on http:\/\/[^:]+:(\d+)/)?.[1];
      if (!port) return;
      // Later output is only drained, so a full pipe can never block the server.
      output = null;
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve({ child, base: `http://127.0.0.1:${port}` });
    });
  });
}

export async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}
