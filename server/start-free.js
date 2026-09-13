require('dotenv').config();
/**
 * Process Supervisor for 100% Free Single-Container Deployment (e.g. Render Free Tier)
 * Spawns the Express API and BullMQ Worker as independent OS processes.
 */
const { fork } = require('child_process');
const path = require('path');

console.log('[Free Deployment Supervisor] Spawning Express API and BullMQ Worker processes...');

const workerProcess = fork(path.join(__dirname, 'workers/pdfWorker.js'), [], {
  stdio: 'inherit',
  env: process.env,
});

const serverProcess = fork(path.join(__dirname, 'index.js'), [], {
  stdio: 'inherit',
  env: process.env,
});

function handleTermination(signal) {
  console.log(`[Free Deployment Supervisor] Received ${signal}. Forwarding to child processes...`);
  if (workerProcess && !workerProcess.killed) {
    workerProcess.kill(signal);
  }
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill(signal);
  }
}

process.on('SIGTERM', () => handleTermination('SIGTERM'));
process.on('SIGINT', () => handleTermination('SIGINT'));

workerProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Free Deployment Supervisor] Worker process exited with code ${code}`);
  }
});

serverProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Free Deployment Supervisor] Server process exited with code ${code}`);
    process.exit(code);
  }
});
