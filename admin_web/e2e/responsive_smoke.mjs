import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(adminDir, '..');
const serverDir = path.join(repoRoot, 'server');

const VIEWPORTS = [360, 390, 430, 768, 1024, 1280, 1440, 1920];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

async function startBackend(apiPort, previewOrigin) {
  const inlineCode = `
    (async () => {
      const { startTestDb, createEphemeralAppRole } = await import('./tests/helpers/db.ts');
      const db = await startTestDb();
      const appRole = await createEphemeralAppRole(db.pool, db.url);
      process.env.DATABASE_URL = appRole.url;
      process.env.NODE_ENV = 'test';
      process.env.APP_DEMO_MODE = 'true';
      process.env.OUTBOX_WORKER_ENABLED = 'false';
      process.env.CORS_ORIGIN = ${JSON.stringify(previewOrigin)};
      const { runDemoSeed } = await import('./src/database/seed-demo.ts');
      await runDemoSeed(db.pool);
      const { buildApp } = await import('./src/app.ts');
      const app = await buildApp();
      await app.listen({ host: '127.0.0.1', port: ${apiPort} });
      console.log('E2E_API_READY:' + ${apiPort});
      const shutdown = async () => {
        try { await app.close(); } catch {}
        try { await appRole.pool.end(); } catch {}
        try { await db.stop(); } catch {}
        process.exit(0);
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `;

  const tsxCli = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(process.execPath, [tsxCli, '-e', inlineCode], {
    cwd: serverDir,
    shell: false,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APP_DEMO_MODE: 'true',
      OUTBOX_WORKER_ENABLED: 'false',
      JWT_SECRET: process.env.JWT_SECRET || 'e2e_smoke_jwt_secret_key_min_32_chars_001',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'e2e_smoke_refresh_secret_key_min_32_chars_002',
      INTEGRATION_ENCRYPTION_KEY:
        process.env.INTEGRATION_ENCRYPTION_KEY ||
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for E2E Fastify API server')), 60000);
    let logs = '';
    child.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      logs += s;
      if (s.includes(`E2E_API_READY:${apiPort}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      logs += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`E2E API exited prematurely (${code}): ${logs}`));
    });
  });

  return child;
}

async function startPreview(previewPort, apiPort) {
  const viteCli = path.join(adminDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'],
    {
      cwd: adminDir,
      shell: false,
      env: {
        ...process.env,
        VITE_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let logs = '';
  child.stdout.on('data', (c) => { logs += c.toString(); });
  child.stderr.on('data', (c) => { logs += c.toString(); });

  let exited = false;
  let exitCode = null;
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`vite preview exited prematurely (${exitCode}): ${logs}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${previewPort}/`);
      if (res.ok) return child;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  throw new Error(`Timed out waiting for vite preview on port ${previewPort}. Logs:\n${logs}`);
}

async function killTree(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch {
    // ignore cleanup failures
  }
}

async function checkNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    throw new Error(
      `Horizontal overflow on ${label}: scrollWidth=${metrics.scrollWidth} > innerWidth=${metrics.innerWidth}`
    );
  }
}

async function ensureSidebarVisibleOnMobile(page, width) {
  if (width >= 1024) return;
  const logoutBtn = page.locator('button[title="Sign Out"]');
  if (!(await logoutBtn.isVisible().catch(() => false))) {
    await page.locator('button[aria-label="Toggle Navigation"]').click();
    await page.waitForTimeout(250);
  }
}

async function main() {
  const apiPort = await getFreePort();
  const previewPort = await getFreePort();
  const baseUrl = `http://127.0.0.1:${previewPort}`;

  let backendProc = null;
  let previewProc = null;
  let browser = null;

  try {
    backendProc = await startBackend(apiPort, baseUrl);
    previewProc = await startPreview(previewPort, apiPort);

    const execPath = findBrowserExecutable();
    browser = await chromium.launch({
      ...(execPath ? { executablePath: execPath } : {}),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const http5xx = [];
    let allowInitialRefresh401 = true;

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        if (allowInitialRefresh401 && txt.includes('401 (Unauthorized)')) {
          return;
        }
        consoleErrors.push(txt);
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });
    page.on('response', (res) => {
      if (res.status() >= 500) {
        http5xx.push(`${res.status()} ${res.url()}`);
      }
    });

    // 1. Login screen check across all 8 viewports
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Demo Admin/i }).waitFor({ state: 'visible', timeout: 15000 });
    allowInitialRefresh401 = false;
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      await checkNoHorizontalOverflow(page, `LoginPage @ ${width}px`);
    }

    // 2. Demo Admin sign-in + Day/Night Vision + Admin routes across 8 viewports
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /Demo Admin/i }).click();
    await page.locator('button[title="Sign Out"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(800);

    // Night Vision toggle check
    await page.locator('button[title*="Night Vision"]').click();
    const themeAfterNight = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (themeAfterNight !== 'night') {
      throw new Error(`Expected data-theme="night" after toggling Night Vision, got: ${themeAfterNight}`);
    }
    await checkNoHorizontalOverflow(page, 'Admin Dashboard Night Vision @ 1280px');
    await page.locator('button[title*="Day Vision"]').click();
    const themeAfterDay = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (themeAfterDay !== 'day') {
      throw new Error(`Expected data-theme="day" after toggling back to Day Vision, got: ${themeAfterDay}`);
    }

    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      await checkNoHorizontalOverflow(page, `Admin Dashboard @ ${width}px`);
    }

    // Navigate key remediated Admin pages
    const sidebar = page.locator('aside');
    await page.setViewportSize({ width: 1280, height: 900 });
    await sidebar.getByRole('button', { name: /Technician Management/i }).click();
    await sidebar.getByRole('button', { name: /All Technicians/i }).click();
    await page.getByText(/Technician KYC & Onboarding Submissions/i).first().waitFor({ state: 'visible', timeout: 10000 });
    await checkNoHorizontalOverflow(page, 'All Technicians @ 1280px');

    await sidebar.getByRole('button', { name: /Performance Leaderboard/i }).click();
    await page.getByText(/Technician Performance/i).first().waitFor({ state: 'visible', timeout: 10000 });
    await checkNoHorizontalOverflow(page, 'Technician Performance @ 1280px');

    // Mobile Night Vision + drawer navigation spot check @ 390px
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBackdrop = page.locator('div.fixed.inset-0.z-30');
    if (await mobileBackdrop.isVisible().catch(() => false)) {
      await mobileBackdrop.click({ position: { x: 350, y: 200 } });
      await page.waitForTimeout(200);
    }
    await page.locator('button[title*="Night Vision"]').click();
    await checkNoHorizontalOverflow(page, 'Technician Performance Night @ 390px');
    await page.locator('button[title*="Day Vision"]').click();

    await ensureSidebarVisibleOnMobile(page, 390);
    await page.locator('button[title="Sign Out"]').click();

    // 3. Demo Staff sign-in + Staff pages across viewports
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /Demo Dispatcher/i }).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: /Demo Dispatcher/i }).click();
    await page.locator('button[title="Sign Out"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(800);

    await sidebar.getByRole('button', { name: /Dispatch & Assignment/i }).click();
    await sidebar.getByRole('button', { name: /Tech Availability/i }).click();
    await page.getByText(/Technician Shift Availability/i).first().waitFor({ state: 'visible', timeout: 10000 });
    await checkNoHorizontalOverflow(page, 'Staff Tech Availability @ 1280px');

    await sidebar.getByRole('button', { name: /Quality & Verification/i }).click();
    await sidebar.getByRole('button', { name: /Customer Support/i }).click();
    await page.getByText(/Customer Communication Desk/i).first().waitFor({ state: 'visible', timeout: 10000 });
    await checkNoHorizontalOverflow(page, 'Staff Customer Comm @ 1280px');

    await sidebar.getByRole('button', { name: /Daily Report/i }).click();
    await page.getByText(/Daily Order Operations Report/i).first().waitFor({ state: 'visible', timeout: 10000 });
    for (const width of [360, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      await checkNoHorizontalOverflow(page, `Staff Daily Report @ ${width}px`);
    }

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors encountered:\n${consoleErrors.join('\n')}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Uncaught page errors encountered:\n${pageErrors.join('\n')}`);
    }
    if (http5xx.length > 0) {
      throw new Error(`HTTP 5xx responses encountered:\n${http5xx.join('\n')}`);
    }

    console.log(
      `[PASS] Admin Web 8-viewport responsive & Day/Night smoke passed (${VIEWPORTS.join(', ')}px), 0 console errors, 0 page errors, 0 HTTP 5xx.`
    );
  } finally {
    await browser?.close().catch(() => {});
    await killTree(previewProc);
    await killTree(backendProc);
  }
}

main().catch((err) => {
  console.error('[FAIL] Admin Web responsive smoke failed:', err);
  process.exit(1);
});
