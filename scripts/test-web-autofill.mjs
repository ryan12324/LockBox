#!/usr/bin/env bun

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { arch, platform, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dir, '..');
const WEB_ROOT = resolve(ROOT, 'apps/web');
const EXTENSION_ROOT = resolve(ROOT, 'apps/extension');
const EXTENSION_OUTPUT = resolve(EXTENSION_ROOT, '.output/chrome-mv3');
const DEFAULT_USERNAME = 'autofill.e2e@example.test';
const DEFAULT_PASSWORD = 'Authwell-E2E-4827!';
const CASE_IDS = [
  'standard',
  'email',
  'signup',
  'password-change',
  'password-only',
  'multi-step',
  'dynamic',
  'phone',
  'pin',
  'fallback',
  'one-time-code',
  'sso-only',
];

const options = parseOptions(process.argv.slice(2));
const bunExecutable = Bun.which('bun');
if (!bunExecutable) fail('Bun is required and was not found on PATH');

const workingRoot = mkdtempSync(join(tmpdir(), 'authwell-web-autofill-'));
const processes = [];
let passed = 0;

try {
  if (!options.skipBuild) {
    run([bunExecutable, 'run', '--filter', '@lockbox/web', 'build'], { inherit: true });
    run([bunExecutable, 'run', '--filter', '@lockbox/extension', 'build'], {
      inherit: true,
      env: { VITE_AUTHWELL_AUTOFILL_E2E: '1' },
    });
  }
  assertE2eExtensionBuild();

  const chromeExecutable = await resolveChromeForTesting(options.chrome);
  const webPort = await availablePort();
  let debugPort = await availablePort();
  while (debugPort === webPort) debugPort = await availablePort();
  const preview = startProcess(
    [
      bunExecutable,
      'x',
      'vite',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    { cwd: WEB_ROOT }
  );
  processes.push(preview);
  const origin = `http://127.0.0.1:${webPort}`;
  await waitFor(async () => (await fetch(origin).catch(() => null))?.ok || null, 'web preview');

  const chrome = startProcess([
    chromeExecutable,
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${join(workingRoot, 'chrome-profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-component-extensions-with-background-pages',
    `--disable-extensions-except=${EXTENSION_OUTPUT}`,
    `--load-extension=${EXTENSION_OUTPUT}`,
    'about:blank',
  ]);
  processes.push(chrome);

  await waitFor(
    async () =>
      (await fetch(`http://127.0.0.1:${debugPort}/json/version`).catch(() => null))?.ok || null,
    'Chrome DevTools endpoint',
    15_000,
    () => processFailure(chrome)
  );
  // A real web page wakes the MV3 worker through content-script messaging.
  const pageTarget = await createPageTarget(debugPort, `${origin}/test?case=standard`);
  const page = await CdpClient.connect(pageTarget.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  const workerTarget = await waitFor(
    async () =>
      (await devtoolsTargets(debugPort)).find(
        (target) => target.type === 'service_worker' && target.url.startsWith('chrome-extension://')
      ) ?? null,
    'Authwell extension service worker',
    15_000,
    () => processFailure(chrome)
  );
  const worker = await CdpClient.connect(workerTarget.webSocketDebuggerUrl);

  console.log(`Web extension AutoFill E2E · ${basename(chromeExecutable)}`);
  for (const id of CASE_IDS) {
    if (!shouldRun(id)) continue;
    const fixture = fixtureFor(id);
    await seed(worker, origin, fixture);
    await runScenario(page, origin, id, fixture);
    pass(id);
  }

  page.close();
  worker.close();
  const expectedPasses = options.case ? 1 : CASE_IDS.length;
  console.log(`\n✓ ${passed}/${expectedPasses} web extension AutoFill scenarios passed`);
} finally {
  for (const child of processes.reverse()) child.kill('SIGTERM');
  rmSync(workingRoot, { recursive: true, force: true });
}

async function runScenario(page, origin, id, fixture) {
  await navigate(page, `${origin}/test?case=${id}&automation=autofill`);
  await waitForSelector(page, '[aria-current="page"]');

  if (id === 'signup') return runSignup(page, id);
  if (id === 'password-change') return runPasswordChange(page, id, fixture);
  if (id === 'multi-step') return runMultiStep(page, id, fixture);
  if (id === 'dynamic') {
    await click(page, '.autofill-test__empty-form button');
    await waitForSelector(page, 'input[name="late-username"]');
    await fillAndSave(
      page,
      id,
      'input[name="late-username"]',
      {
        'late-username': fixture.username,
        'late-password': fixture.password,
      },
      { 'late-password': 'UpdatedE2EDynamic4827x' }
    );
    return;
  }
  if (id === 'one-time-code') return runOneTimeCode(page, id);
  if (id === 'sso-only') return runSsoOnly(page, id);

  const cases = {
    standard: {
      focus: 'input[name="username"]',
      expected: { username: fixture.username, password: fixture.password },
      mutate: { password: 'UpdatedE2EStandard4827x' },
    },
    email: {
      focus: 'input[name="email"]',
      expected: { email: fixture.username, password: fixture.password },
      mutate: { password: 'UpdatedE2EEmail4827x' },
    },
    'password-only': {
      focus: 'input[name="password"]',
      expected: { password: fixture.password },
      mutate: { password: 'UpdatedE2EPasswordOnly4827x' },
    },
    phone: {
      focus: 'input[name="mobile"]',
      expected: { mobile: fixture.username, password: fixture.password },
      mutate: { password: 'UpdatedE2EPhone4827x' },
    },
    pin: {
      focus: 'input[name="username"]',
      expected: { username: fixture.username, pin: fixture.password },
      mutate: { pin: '739204' },
    },
    fallback: {
      focus: '#accountEmailInput',
      expected: {
        accountEmailInput: fixture.username,
        passwd: fixture.password,
        searchQuery: '',
      },
      mutate: { passwd: 'UpdatedE2EFallback4827x' },
    },
  };
  const testCase = cases[id];
  if (!testCase) fail(`${id}: no browser scenario implementation`);
  await fillAndSave(page, id, testCase.focus, testCase.expected, testCase.mutate);
}

async function fillAndSave(page, id, focus, expected, mutate) {
  await clickAutofillControl(page, focus);
  await waitFor(
    async () => inputsMatch(await readInputs(page), expected),
    `${id}: credential values`
  );
  assertInputs(await readInputs(page), expected, id);
  await setInputs(page, mutate);
  await submitAndExpectBanner(page, id);
}

async function runSignup(page, id) {
  await Bun.sleep(300);
  const controlCount = await page.evaluate(
    `document.querySelectorAll('[data-authwell-ui="field-control"]').length`
  );
  if (controlCount !== 1)
    fail(`${id}: expected one generated-password control, found ${controlCount}`);
  await chooseGeneratedPassword(page, id);
  await setInputs(page, { username: 'new.account@example.test' });
  await submitAndExpectBanner(page, id);
}

async function runPasswordChange(page, id, fixture) {
  await clickAutofillControl(page, 'input[name="current-password"]');
  await waitFor(
    async () => (await readInputs(page))['current-password'] === fixture.password,
    `${id}: current credential values`
  );
  assertInputs(
    await readInputs(page),
    {
      username: fixture.username,
      'current-password': fixture.password,
      'new-password': '',
      'confirm-password': '',
    },
    id
  );
  await chooseGeneratedPassword(page, id);
  await submitAndExpectBanner(page, id);
}

async function chooseGeneratedPassword(page, id) {
  await clickAutofillControl(page, 'input[name="new-password"]');
  await waitFor(
    async () =>
      await page.evaluate(
        `Boolean(document.querySelector('[data-authwell-ui="generation-menu"]')?.shadowRoot?.querySelector('[data-generation-choice="strong"]'))`
      ),
    `${id}: generated-password choices`
  );
  await page.evaluate(`document
    .querySelector('[data-authwell-ui="generation-menu"]')
    .shadowRoot
    .querySelector('[data-generation-choice="strong"]')
    .click()`);
  const generated = await readInputs(page);
  if (!generated['new-password'] || generated['new-password'] !== generated['confirm-password']) {
    fail(`${id}: generated password was not filled into both new-password fields`);
  }
  return generated['new-password'];
}

async function runMultiStep(page, id, fixture) {
  await clickAutofillControl(page, 'input[name="username"]');
  await waitFor(
    async () => (await readInputs(page)).username === fixture.username,
    `${id}: username-only first step`
  );
  await click(page, 'form button[type="submit"]');
  await waitForSelector(page, 'input[name="password"]');
  await clickAutofillControl(page, 'input[name="password"]');
  await waitFor(
    async () => (await readInputs(page)).password === fixture.password,
    `${id}: password second step`
  );
  await setInputs(page, { password: 'UpdatedE2EMultiStep4827x' });
  await submitAndExpectBanner(page, id);
}

async function runOneTimeCode(page, id) {
  const passwordFields = await page.evaluate(
    `document.querySelectorAll('input[type="password"]').length`
  );
  if (passwordFields !== 0) fail(`${id}: the verification form unexpectedly contains a password`);
  await setInputs(page, { username: DEFAULT_USERNAME, 'one-time-code': '482701' });
  await click(page, 'form.autofill-test__form button[type="submit"]');
  await assertBannerAbsent(page, id);
}

async function runSsoOnly(page, id) {
  const inputs = await page.evaluate(`document.querySelectorAll('input').length`);
  if (inputs !== 0) fail(`${id}: expected no credential inputs, found ${inputs}`);
  await click(page, '.autofill-test__sso button');
  await assertBannerAbsent(page, id);
}

async function submitAndExpectBanner(page, id) {
  await click(page, 'form.autofill-test__form button[type="submit"]');
  await waitFor(
    async () => await page.evaluate(`Boolean(document.getElementById('lockbox-save-banner'))`),
    `${id}: Authwell save or update banner`,
    900
  );
}

async function assertBannerAbsent(page, id) {
  await Bun.sleep(600);
  const present = await page.evaluate(`Boolean(document.getElementById('lockbox-save-banner'))`);
  if (present) fail(`${id}: Authwell offered to save a non-password flow`);
}

async function seed(worker, origin, fixture) {
  const result = await worker.evaluate(
    `new Promise((resolve) => chrome.runtime.sendMessage(${JSON.stringify({
      type: 'e2e-seed-autofill',
      origin,
      username: fixture.username,
      password: fixture.password,
    })}, resolve))`
  );
  if (!result?.success) fail(`Extension fixture seed failed: ${result?.error ?? 'unknown error'}`);
}

function fixtureFor(id) {
  if (id === 'phone') return { username: '+44 7700 900123', password: DEFAULT_PASSWORD };
  if (id === 'pin') return { username: 'account-4827', password: '482701' };
  if (id === 'password-only') {
    return { username: 'demo.account@example.test', password: DEFAULT_PASSWORD };
  }
  if (id === 'fallback') {
    return { username: 'fallback.account@example.test', password: DEFAULT_PASSWORD };
  }
  return { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD };
}

async function clickAutofillControl(page, fieldSelector) {
  await waitForSelector(page, fieldSelector);
  const point = await waitFor(
    async () =>
      page.evaluateJson(`(() => {
    const field = document.querySelector(${JSON.stringify(fieldSelector)});
    if (!field) return null;
    const fieldBounds = field.getBoundingClientRect();
    const fieldY = fieldBounds.top + fieldBounds.height / 2;
    const controls = [...document.querySelectorAll('[data-authwell-ui="field-control"]')]
      .map((control) => {
        const bounds = control.getBoundingClientRect();
        return {
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
          distance: Math.abs(bounds.top + bounds.height / 2 - fieldY),
          visible: bounds.width > 0 && bounds.height > 0,
        };
      })
      .filter((control) => control.visible)
      .sort((left, right) => left.distance - right.distance);
    return controls[0] ?? null;
  })()`),
    `Authwell control for ${fieldSelector}`
  );
  await page.clickPoint(point.x, point.y);
}

async function setInputs(page, values) {
  await page.evaluate(`(() => {
    const values = ${JSON.stringify(values)};
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [name, value] of Object.entries(values)) {
      const field = [...document.querySelectorAll('input')]
        .find((input) => input.name === name || input.id === name);
      if (!field) throw new Error('Missing input: ' + name);
      setter.call(field, value);
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);
}

async function readInputs(page) {
  return page.evaluateJson(`Object.fromEntries(
    [...document.querySelectorAll('input')].map((input) => [input.name || input.id, input.value])
  )`);
}

function inputsMatch(actual, expected) {
  return Object.entries(expected).every(([name, value]) => actual[name] === value);
}

function assertInputs(actual, expected, id) {
  for (const [name, value] of Object.entries(expected)) {
    if (actual[name] !== value) {
      fail(`${id}: ${name} expected ${JSON.stringify(value)}, got ${JSON.stringify(actual[name])}`);
    }
  }
}

async function click(page, selector) {
  const point = await page.evaluateJson(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing element: ${selector.replaceAll("'", "\\'")}');
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const bounds = element.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  })()`);
  await page.clickPoint(point.x, point.y);
}

async function navigate(page, url) {
  await page.send('Page.navigate', { url });
  await waitFor(
    async () =>
      await page.evaluate(
        `document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`
      ),
    `page navigation to ${url}`
  );
}

async function waitForSelector(page, selector) {
  await waitFor(
    async () => await page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
    `DOM element ${selector}`
  );
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }

  static async connect(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    const response = new Promise((resolveResponse, rejectResponse) => {
      this.pending.set(id, { resolve: resolveResponse, reject: rejectResponse });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text ??
          'Browser evaluation failed'
      );
    }
    return response.result?.value;
  }

  async evaluateJson(expression) {
    const encoded = await this.evaluate(`JSON.stringify(${expression})`);
    return JSON.parse(encoded);
  }

  async clickPoint(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
  }

  close() {
    this.socket.close();
  }
}

async function createPageTarget(port, url) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  if (!response.ok) fail(`Chrome could not create a test tab (${response.status})`);
  return response.json();
}

async function devtoolsTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null);
  return response?.ok ? response.json() : [];
}

async function availablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? rejectPort(error) : resolvePort(port)));
    });
  });
}

function startProcess(command, { cwd = ROOT } = {}) {
  const child = spawn(command[0], command.slice(1), {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.output = '';
  child.stdout.on('data', (chunk) => {
    child.output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    child.output += chunk.toString();
  });
  return child;
}

function processFailure(child) {
  if (child.exitCode === null) return null;
  return new Error(
    `Chrome exited with code ${child.exitCode}${child.output.trim() ? `\n${child.output.trim()}` : ''}`
  );
}

function run(command, { inherit = false, env = {} } = {}) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(`${command.join(' ')} failed (${result.status})\n${result.stderr || result.stdout || ''}`);
  }
}

function assertE2eExtensionBuild() {
  const backgroundPath = resolve(EXTENSION_OUTPUT, 'background.js');
  if (!existsSync(backgroundPath)) fail(`Extension build not found at ${EXTENSION_OUTPUT}`);
  const background = readFileSync(backgroundPath, 'utf8');
  if (!background.includes('AutoFill E2E is restricted to loopback origins')) {
    fail('The unpacked extension was not built with VITE_AUTHWELL_AUTOFILL_E2E=1');
  }
}

async function resolveChromeForTesting(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.AUTHWELL_CHROME_BINARY,
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/private/tmp/authwell-chrome-for-testing/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  if (options.noBrowserDownload) {
    fail(
      'Chrome for Testing was not found. Pass --chrome /path/to/binary or omit --no-browser-download.'
    );
  }
  return downloadChromeForTesting();
}

async function downloadChromeForTesting() {
  const hostPlatform = platform();
  const hostArch = arch();
  const platformName =
    hostPlatform === 'darwin'
      ? hostArch === 'arm64'
        ? 'mac-arm64'
        : 'mac-x64'
      : hostPlatform === 'linux' && hostArch === 'x64'
        ? 'linux64'
        : null;
  if (!platformName)
    fail(`Automatic Chrome for Testing download is unsupported on ${hostPlatform}/${hostArch}`);

  console.log('Chrome for Testing not found; downloading the current stable build…');
  const metadataResponse = await fetch(
    'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'
  );
  if (!metadataResponse.ok) fail('Could not resolve the current Chrome for Testing build');
  const metadata = await metadataResponse.json();
  const stable = metadata.channels?.Stable;
  const download = stable?.downloads?.chrome?.find((entry) => entry.platform === platformName);
  if (!stable?.version || !download?.url)
    fail('Chrome for Testing metadata had no compatible stable build');

  const cacheRoot = join(tmpdir(), 'authwell-chrome-for-testing', stable.version, platformName);
  const executable = platformName.startsWith('mac-')
    ? join(
        cacheRoot,
        `chrome-${platformName}`,
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      )
    : join(cacheRoot, 'chrome-linux64', 'chrome');
  if (existsSync(executable)) return executable;

  mkdirSync(cacheRoot, { recursive: true });
  const archive = join(cacheRoot, 'chrome.zip');
  const archiveResponse = await fetch(download.url);
  if (!archiveResponse.ok) fail(`Chrome for Testing download failed (${archiveResponse.status})`);
  await Bun.write(archive, await archiveResponse.arrayBuffer());
  const extractor =
    hostPlatform === 'darwin'
      ? ['ditto', '-x', '-k', archive, cacheRoot]
      : ['unzip', '-q', archive, '-d', cacheRoot];
  run(extractor);
  if (!existsSync(executable)) fail('Chrome for Testing extracted without its executable');
  return executable;
}

function parseOptions(args) {
  const parsed = {
    case: undefined,
    chrome: undefined,
    skipBuild: false,
    noBrowserDownload: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--case') parsed.case = args[++index];
    else if (argument === '--chrome') parsed.chrome = resolve(args[++index]);
    else if (argument === '--skip-build') parsed.skipBuild = true;
    else if (argument === '--no-browser-download') parsed.noBrowserDownload = true;
    else if (argument === '--help' || argument === '-h') {
      console.log(
        `Usage: bun run web:test:autofill [-- --case standard] [--chrome /path/to/chrome] [--skip-build]\n\nBuilds the web app and a loopback-only E2E extension, then drives all 12 /test scenarios in Chrome for Testing.`
      );
      process.exit(0);
    } else fail(`Unknown option: ${argument}`);
  }
  if (parsed.case !== undefined && !CASE_IDS.includes(parsed.case)) {
    fail(`Unknown AutoFill case: ${parsed.case}`);
  }
  return parsed;
}

function shouldRun(id) {
  return options.case === undefined || options.case === id;
}

async function waitFor(check, description, timeout = 10_000, earlyFailure = () => null) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    const processError = earlyFailure();
    if (processError) throw processError;
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(50);
  }
  fail(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

function pass(id) {
  passed += 1;
  console.log(`  ✓ ${id}`);
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}
