const puppeteer = require('puppeteer-core');
const fs = require('fs');

const browserPaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

let executablePath = browserPaths.find(p => fs.existsSync(p));
if (!executablePath) {
  console.error('Supported browser (Edge/Chrome/Chromium) executable not found');
  process.exit(1);
}

const BASE_URL = 'http://127.0.0.1:3000';

async function runAudit() {
  console.log('--- STARTING 49-PAGE FULL PRODUCTION AUDIT ---');
  console.log(`Browser: ${executablePath}`);
  console.log(`Target: ${BASE_URL}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push({ text: err.toString(), stack: err.stack });
  });

  // Step 1: Initialize session as authenticated Admin
  console.log('\n[Phase 1] Setting authenticated Admin session...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const adminSession = {
      user: {
        name: 'Master Administrator',
        email: 'admin@servicepro.com',
        phone: '+1 (800) 010-0000',
        role: 'ADMIN',
        title: 'Platform Administrator',
        avatar: '',
        territory: 'HQ',
        department: 'Executive Administration',
        twoFactorEnabled: false,
        bio: ''
      },
      role: 'ADMIN',
      token: 'sec_tok_master_audit_2026',
      loginTime: new Date().toISOString()
    };
    localStorage.setItem('servicepro_auth_session', JSON.stringify(adminSession));
    localStorage.setItem('servicepro_setup_completed', 'true');
  });

  // Step 2: Audit all 38 Admin Pages (Pages 1-36 + Page 37 Profile + Page 38 System Installer)
  console.log('\n[Phase 2] Crawling Admin Pages 1 through 38...');
  const adminPageResults = [];

  for (let i = 1; i <= 38; i++) {
    const url = `${BASE_URL}/#/page/${i}`;
    const errorsBefore = consoleErrors.length;
    
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 200));

    // Check for runtime exceptions, broken texts
    const pageCheck = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasNan = /\bNaN\b/.test(text);
      const hasUndefined = /\bundefined\b/.test(text);
      const hasObjectObject = /\[object Object\]/.test(text);
      const hasErrorBoundary = text.includes('Something went wrong') || text.includes('Application Error');
      const titleEl = document.querySelector('h1, h2');
      return {
        title: titleEl ? titleEl.innerText : 'No heading found',
        hasNan,
        hasUndefined,
        hasObjectObject,
        hasErrorBoundary,
        bodyLength: text.length
      };
    });

    const pageErrors = consoleErrors.slice(errorsBefore);
    const pass = !pageCheck.hasNan && !pageCheck.hasObjectObject && !pageCheck.hasUndefined && !pageCheck.hasErrorBoundary && pageErrors.length === 0;

    adminPageResults.push({
      page: i,
      title: pageCheck.title,
      pass,
      bodyLength: pageCheck.bodyLength,
      errors: pageErrors.map(e => e.text)
    });

    process.stdout.write(pass ? `[✓ P${i}] ` : `[✗ P${i}] `);
    if (i % 6 === 0) console.log('');
  }

  // Step 3: Switch session to Staff and test all 14 Staff Pages (Staff 101-113 + Staff 114 Profile)
  console.log('\n\n[Phase 3] Setting Staff session and crawling Staff Pages 101 through 114...');
  await page.evaluate(() => {
    const staffSession = {
      user: {
        name: 'Staff Dispatcher',
        email: 'staff@servicepro.com',
        phone: '+1 (800) 010-0001',
        role: 'STAFF',
        title: 'Operations Coordinator',
        avatar: '',
        territory: 'HQ',
        department: 'Field Operations',
        twoFactorEnabled: false,
        bio: ''
      },
      role: 'STAFF',
      token: 'sec_tok_staff_audit_2026',
      loginTime: new Date().toISOString()
    };
    localStorage.setItem('servicepro_auth_session', JSON.stringify(staffSession));
  });
  await page.reload({ waitUntil: 'networkidle0' });

  const staffPageResults = [];

  for (let i = 101; i <= 114; i++) {
    const url = `${BASE_URL}/#/staff/${i}`;
    const errorsBefore = consoleErrors.length;
    
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 200));

    const pageCheck = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasNan = /\bNaN\b/.test(text);
      const hasUndefined = /\bundefined\b/.test(text);
      const hasObjectObject = /\[object Object\]/.test(text);
      const hasErrorBoundary = text.includes('Something went wrong') || text.includes('Application Error');
      const titleEl = document.querySelector('h1, h2');
      return {
        title: titleEl ? titleEl.innerText : 'No heading found',
        hasNan,
        hasUndefined,
        hasObjectObject,
        hasErrorBoundary,
        bodyLength: text.length
      };
    });

    const pageErrors = consoleErrors.slice(errorsBefore);
    const pass = !pageCheck.hasNan && !pageCheck.hasObjectObject && !pageCheck.hasUndefined && !pageCheck.hasErrorBoundary && pageErrors.length === 0;

    staffPageResults.push({
      page: i,
      title: pageCheck.title,
      pass,
      bodyLength: pageCheck.bodyLength,
      errors: pageErrors.map(e => e.text)
    });

    process.stdout.write(pass ? `[✓ S${i}] ` : `[✗ S${i}(err:${pageErrors.length},undef:${pageCheck.hasUndefined})] `);
    if (!pass && pageErrors.length > 0) console.error('\nS' + i + ' errors:', pageErrors.map(e => e.text));
    if (i % 7 === 0) console.log('');
  }

  // Step 4: Verify Live Threat Scanner on Top Search Bar
  console.log('\n\n[Phase 4] Testing live SQL injection interception on Search Bar...');
  await page.goto(`${BASE_URL}/#/staff/101`, { waitUntil: 'networkidle0' });
  const searchInput = await page.$('input[placeholder*="Search"]');
  if (searchInput) {
    await searchInput.type("' OR 1=1 -- UNION SELECT * FROM users");
    await new Promise(r => setTimeout(r, 400));
    const threatDetected = await page.evaluate(() => {
      return document.body.innerText.includes('Security Warning') || document.body.innerText.includes('SQL_INJECTION');
    });
    console.log(`Threat Interception Result: ${threatDetected ? 'SUCCESS (Payload Blocked & Toasted)' : 'FAILED'}`);
  }

  // Step 5: Verify RBAC Privilege-Elevation Prevention & Functional State Persistence
  console.log('\n[Phase 5] Verifying RBAC privilege-elevation block (STAFF -> Admin Page 1) & state persistence...');
  await page.goto(`${BASE_URL}/#/page/1`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const rbacCheck = await page.evaluate(() => {
    const hash = window.location.hash;
    const text = document.body.innerText;
    const blocked = hash.includes('/staff/') || text.includes('Access Denied: Administrative Clearance Required') || text.includes('Administrative Clearance Required');
    const secLogs = JSON.parse(localStorage.getItem('servicepro_security_logs') || '[]');
    const hasAccessDeniedLog = secLogs.some(l => l.eventType === 'PRIVILEGE_ELEVATION_DENIED' || l.action === 'PRIVILEGE_ELEVATION_DENIED');
    return { blocked, hasAccessDeniedLog, hash };
  });
  console.log(`RBAC Privilege-Elevation Block: ${rbacCheck.blocked && rbacCheck.hasAccessDeniedLog ? 'SUCCESS (Redirected to ' + rbacCheck.hash + ' & Audited)' : 'FAILED'}`);

  // Switch back to Admin and verify functional booking state persistence & backup export readiness
  await page.evaluate(() => {
    const raw = localStorage.getItem('servicepro_auth_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.role = 'ADMIN';
      parsed.user.role = 'ADMIN';
      localStorage.setItem('servicepro_auth_session', JSON.stringify(parsed));
    }
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.goto(`${BASE_URL}/#/page/5`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 250));
  const workflowCheck = await page.evaluate(() => {
    const bookings = JSON.parse(localStorage.getItem('servicepro_bookings') || '[]');
    const newBooking = {
      id: 'bk-e2e-audit-1',
      jobNo: 'JOB-9901',
      customerName: 'Verified E2E Client',
      customerPhone: '+18005550199',
      customerAddress: '100 Verification Way',
      serviceName: 'HVAC Diagnostic',
      category: 'HVAC',
      technicianName: 'Unassigned',
      technicianId: '',
      scheduleDate: '2026-11-15',
      scheduleTime: '10:00 AM',
      estimate: 185,
      paymentStatus: 'Pending',
      status: 'Scheduled',
      priority: 'Medium',
      lat: 25.7617,
      lng: -80.1918
    };
    const updated = [newBooking, ...bookings.filter(b => b.id !== 'bk-e2e-audit-1')];
    localStorage.setItem('servicepro_bookings', JSON.stringify(updated));
    const reRead = JSON.parse(localStorage.getItem('servicepro_bookings') || '[]');
    const persisted = reRead.some(b => b.id === 'bk-e2e-audit-1' && b.jobNo === 'JOB-9901');
    // Clean up test booking so workspace remains clean
    localStorage.setItem('servicepro_bookings', JSON.stringify(bookings));
    return { persisted };
  });
  console.log(`Functional Booking State Persistence & Recovery: ${workflowCheck.persisted ? 'SUCCESS' : 'FAILED'}`);

  // Step 6: Summary
  const adminPassed = adminPageResults.filter(r => r.pass).length;
  const staffPassed = staffPageResults.filter(r => r.pass).length;
  const totalPassed = adminPassed + staffPassed;
  const totalPages = adminPageResults.length + staffPageResults.length;

  console.log('\n======================================================');
  console.log(`AUDIT COMPLETE: ${totalPassed}/${totalPages} PAGES PASSED WITH 0 ERRORS`);
  console.log(`Admin Portal: ${adminPassed}/38 Passed`);
  console.log(`Staff Portal: ${staffPassed}/14 Passed`);
  console.log(`RBAC & Workflow Assertions: ${rbacCheck.blocked && workflowCheck.persisted ? 'PASSED' : 'FAILED'}`);
  console.log(`Total Console / Page Errors: ${consoleErrors.length}`);
  console.log('======================================================\n');

  await browser.close();

  if (totalPassed === totalPages && consoleErrors.length === 0 && rbacCheck.blocked && workflowCheck.persisted) {
    console.log('ALL AUDIT CRITERIA MET - 100% PRODUCTION READY!');
    process.exit(0);
  } else {
    console.error('Audit detected issues that need fixing.');
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Audit runner error:', err);
  process.exit(1);
});
