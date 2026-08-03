#!/usr/bin/env bun

import { resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dir, '..');
const APK = resolve(ROOT, 'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk');
const PACKAGE = 'dev.lockbox.app';
const MAIN_ACTIVITY = `${PACKAGE}/.MainActivity`;
const AUTOFILL_SERVICE = `${PACKAGE}/${PACKAGE}.autofill.LockboxAutofillService`;
const E2E_RECEIVER = `${PACKAGE}/${PACKAGE}.autofill.AutofillE2eSeedReceiver`;
const SEED_ACTION = `${PACKAGE}.debug.SEED_AUTOFILL_E2E`;
const RESET_ACTION = `${PACKAGE}.debug.RESET_AUTOFILL_E2E`;
const UI_DUMP_PATH = '/sdcard/authwell-autofill-e2e-window.xml';
const DEFAULT_PASSWORD = 'Authwell-E2E-4827!';
const CASE_IDS = [
  'standard', 'email', 'signup', 'password-change', 'password-only', 'multi-step',
  'dynamic', 'phone', 'pin', 'fallback', 'one-time-code', 'sso-only',
];

const options = parseOptions(process.argv.slice(2));
const adbExecutable = Bun.which('adb');
if (!adbExecutable) fail('adb is required and was not found on PATH');
const serial = options.serial ?? findRunningEmulator();
if (!serial?.startsWith('emulator-')) {
  fail('The AutoFill E2E suite only runs on an emulator; pass --serial emulator-####');
}

if (!options.skipBuild) {
  run([resolve(ROOT, 'scripts/build-android.sh')], { cwd: ROOT, inherit: true });
}
if (!(await Bun.file(APK).exists())) fail(`Debug APK not found at ${APK}`);

let activeForward;
let passed = 0;

try {
  console.log(`Android AutoFill E2E · ${serial}`);
  adb(['install', '-r', APK], { inherit: true });
  adb(['shell', 'settings', 'put', 'secure', 'autofill_service', AUTOFILL_SERVICE]);
  adb(['shell', 'svc', 'power', 'stayon', 'true']);
  adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  adb(['shell', 'wm', 'dismiss-keyguard']);

  if (shouldRun('standard')) await runFillCase({
    id: 'standard',
    focus: 'input[name="username"]',
    expected: { username: 'autofill.e2e@example.test', password: DEFAULT_PASSWORD },
    mutate: { password: 'UpdatedE2EStandard4827x' },
  });
  if (shouldRun('email')) await runFillCase({
    id: 'email',
    focus: 'input[name="email"]',
    expected: { email: 'autofill.e2e@example.test', password: DEFAULT_PASSWORD },
    mutate: { password: 'UpdatedE2EEmail4827x' },
  });
  if (shouldRun('signup')) await runSignupCase();
  if (shouldRun('password-change')) await runPasswordChangeCase();
  if (shouldRun('password-only')) await runFillCase({
    id: 'password-only',
    focus: 'input[name="password"]',
    pickerLabel: 'demo.account@example.test',
    expected: { password: DEFAULT_PASSWORD },
    mutate: { password: 'UpdatedE2EPasswordOnly4827x' },
  });
  if (shouldRun('multi-step')) await runMultiStepCase();
  if (shouldRun('dynamic')) await runFillCase({
    id: 'dynamic',
    beforeFill: async (cdp) => {
      await cdp.evaluate(`
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent?.includes('Insert login form'))?.click()
      `);
      await waitForDom(cdp, 'input[name="late-username"]');
    },
    focus: 'input[name="late-username"]',
    expected: { 'late-username': 'autofill.e2e@example.test', 'late-password': DEFAULT_PASSWORD },
    mutate: { 'late-password': 'UpdatedE2EDynamic4827x' },
  });
  if (shouldRun('phone')) await runFillCase({
    id: 'phone',
    focus: 'input[name="mobile"]',
    expected: { mobile: '+44 7700 900123', password: DEFAULT_PASSWORD },
    mutate: { password: 'UpdatedE2EPhone4827x' },
  });
  if (shouldRun('pin')) await runFillCase({
    id: 'pin',
    focus: 'input[name="username"]',
    expected: { username: 'account-4827', pin: '482701' },
    mutate: { pin: '739204' },
  });
  if (shouldRun('fallback')) await runFillCase({
    id: 'fallback',
    focus: '#accountEmailInput',
    expected: {
      accountEmailInput: 'fallback.account@example.test',
      passwd: DEFAULT_PASSWORD,
      searchQuery: '',
    },
    mutate: { passwd: 'UpdatedE2EFallback4827x' },
  });
  if (shouldRun('one-time-code')) await runOneTimeCodeCase();
  if (shouldRun('sso-only')) await runSsoOnlyCase();

  const expectedPasses = options.case ? 1 : CASE_IDS.length;
  console.log(`\n✓ ${passed}/${expectedPasses} Android AutoFill scenarios passed`);
} finally {
  if (activeForward) adb(['forward', '--remove', `tcp:${activeForward}`], { allowFailure: true });
  adb(['shell', 'am', 'force-stop', PACKAGE], { allowFailure: true });
  adb([
    'shell', 'am', 'broadcast', '--receiver-foreground',
    '-a', RESET_ACTION, '-n', E2E_RECEIVER,
  ], { allowFailure: true });
  adb(['shell', 'rm', '-f', UI_DUMP_PATH], { allowFailure: true });
}

async function runFillCase({ id, focus, pickerLabel, expected, mutate, beforeFill }) {
  const cdp = await startScenario(id);
  try {
    if (beforeFill) await beforeFill(cdp);
    const expectedFilledValue = Object.values(expected).find((value) => value) ?? '';
    await chooseCredential(
      cdp,
      focus,
      pickerLabel ?? expectedPickerLabel(expectedFilledValue),
      expectedFilledValue
    );
    assertInputs(await readInputs(cdp), expected, id);
    await setInputs(cdp, mutate);
    await submitAndExpectSave(cdp, id);
    pass(id);
  } finally {
    cdp.close();
  }
}

async function runSignupCase() {
  const id = 'signup';
  const cdp = await startScenario(id);
  try {
    await chooseGeneratedPassword(cdp, id);
    await setInputs(cdp, { username: 'new.account@example.test' });
    await submitAndExpectSave(cdp, id);
    pass(id);
  } finally {
    cdp.close();
  }
}

async function runPasswordChangeCase() {
  const id = 'password-change';
  const cdp = await startScenario(id);
  try {
    await chooseCredential(
      cdp,
      'input[name="username"]',
      'autofill.e2e@example.test',
      DEFAULT_PASSWORD
    );
    assertInputs(await readInputs(cdp), {
      username: 'autofill.e2e@example.test',
      'current-password': DEFAULT_PASSWORD,
      'new-password': '',
      'confirm-password': '',
    }, id);
    await chooseGeneratedPassword(cdp, id);
    await submitAndExpectSave(cdp, id);
    pass(id);
  } finally {
    cdp.close();
  }
}

async function chooseGeneratedPassword(cdp, id) {
  await tapDom(cdp, 'input[name="new-password"]');
  const hierarchy = await waitFor(async () => {
    const xml = dumpUi();
    return findNode(xml, (node) => node.text === 'Use a strong password') ? xml : null;
  }, `${id}: generated-password picker`, 8_000);
  const suggestion = findNode(hierarchy, (node) => node.text === 'Use a strong password');
  tapBounds(suggestion.bounds);
  const generated = await waitFor(async () => {
    const values = await readInputs(cdp);
    return values['new-password'] &&
      values['new-password'] === values['confirm-password'] ? values : null;
  }, `${id}: generated password in both new-password fields`, 5_000);
  if (!generated['new-password']) fail(`${id}: generated password is empty`);
  return generated['new-password'];
}

async function runMultiStepCase() {
  const id = 'multi-step';
  let cdp = await startScenario(id);
  try {
    await chooseCredential(
      cdp,
      'input[name="username"]',
      'autofill.e2e@example.test',
      'autofill.e2e@example.test'
    );
    assertInputs(await readInputs(cdp), { username: 'autofill.e2e@example.test' }, id);
    await tapDom(cdp, 'form button[type="submit"]');
    await waitForDom(cdp, 'input[name="password"]');
    await chooseCredential(
      cdp,
      'input[name="password"]',
      'autofill.e2e@example.test',
      DEFAULT_PASSWORD
    );
    assertInputs(await readInputs(cdp), { password: DEFAULT_PASSWORD }, id);
    await setInputs(cdp, { password: 'UpdatedE2EMultiStep4827x' });
    await submitAndExpectSave(cdp, id);
    pass(id);
  } finally {
    cdp.close();
  }
}

async function runOneTimeCodeCase() {
  const id = 'one-time-code';
  const cdp = await startScenario(id);
  try {
    await tapDom(cdp, 'input[name="one-time-code"]');
    await assertCredentialPickerAbsent();
    await setInputs(cdp, { username: 'autofill.e2e@example.test', 'one-time-code': '482701' });
    await submitAndExpectNoSave(cdp, id);
    pass(id);
  } finally {
    cdp.close();
  }
}

async function runSsoOnlyCase() {
  const id = 'sso-only';
  const cdp = await startScenario(id);
  try {
    const inputCount = await cdp.evaluate(`document.querySelectorAll('input').length`);
    if (inputCount !== 0) fail(`${id}: expected no credential inputs, found ${inputCount}`);
    await tapDom(cdp, '.autofill-test__sso button');
    await assertSavePromptAbsent();
    pass(id);
  } finally {
    cdp.close();
  }
}

async function startScenario(id) {
  seedScenario(id);
  if (activeForward) {
    adb(['forward', '--remove', `tcp:${activeForward}`], { allowFailure: true });
    activeForward = undefined;
  }
  adb(['shell', 'am', 'force-stop', PACKAGE]);
  adb(['logcat', '-c']);
  adb(['shell', 'am', 'start', '-W', '-n', MAIN_ACTIVITY]);
  const pid = await waitFor(async () => adb(['shell', 'pidof', PACKAGE], { allowFailure: true }).trim() || null,
    `${id}: Authwell process`);
  const socketName = `webview_devtools_remote_${pid}`;
  await waitFor(async () => {
    const sockets = adb(['shell', 'cat', '/proc/net/unix'], { allowFailure: true });
    return sockets.includes(`@${socketName}`) ? socketName : null;
  }, `${id}: debuggable WebView`);
  activeForward = adb(['forward', 'tcp:0', `localabstract:${socketName}`]).trim();
  const cdp = await CdpClient.connect(Number(activeForward));
  await cdp.evaluate(`
    history.pushState({}, '', ${JSON.stringify(`/test?case=${id}`)});
    dispatchEvent(new PopStateEvent('popstate'));
  `);
  await waitFor(async () => {
    const selected = await cdp.evaluate(
      `document.querySelector('[aria-current="page"] strong')?.textContent ?? null`
    );
    return selected ? true : null;
  }, `${id}: test page`);
  return cdp;
}

function seedScenario(id) {
  const output = adb([
    'shell', 'am', 'broadcast', '--receiver-foreground',
    '-a', SEED_ACTION, '-n', E2E_RECEIVER, '--es', 'scenario', id,
  ]);
  if (!output.includes(`data="seeded=${id}"`)) fail(`${id}: fixture seed failed\n${output}`);
}

async function chooseCredential(cdp, selector, pickerLabel, expectedValue) {
  let hierarchy = dumpUi();
  if (!findNode(hierarchy, (node) => node.text === pickerLabel)) {
    await tapDom(cdp, selector);
  }
  hierarchy = await waitFor(async () => {
    const xml = dumpUi();
    return findNode(xml, (node) => node.text === pickerLabel) ? xml : null;
  }, `credential picker for ${selector}`, 8_000);
  const credentialNode = findNode(
    hierarchy,
    (node) => node.text === pickerLabel
  );
  tapBounds(credentialNode.bounds);
  await waitFor(async () => {
    const values = await readInputs(cdp);
    return Object.values(values).includes(expectedValue) ? true : null;
  }, `credential values for ${selector}`, 5_000);
}

function expectedPickerLabel(expectedValue) {
  if (expectedValue === DEFAULT_PASSWORD) return 'autofill.e2e@example.test';
  return expectedValue;
}

function shouldRun(id) {
  return options.case === undefined || options.case === id;
}

async function tapDom(cdp, selector) {
  await cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing element: ${escapeForJs(selector)}');
    element.scrollIntoView({ block: 'center', inline: 'center' });
  })()`);
  await Bun.sleep(350);
  const point = await cdp.evaluateJson(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.round((bounds.left + bounds.width / 2) * devicePixelRatio),
      y: Math.round((bounds.top + bounds.height / 2) * devicePixelRatio),
    };
  })()`);
  adb(['shell', 'input', 'tap', String(point.x), String(point.y)]);
}

async function waitForDom(cdp, selector) {
  await waitFor(
    async () => await cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
    `DOM element ${selector}`
  );
}

async function readInputs(cdp) {
  return await cdp.evaluateJson(`Object.fromEntries(
    [...document.querySelectorAll('input')].map((input) => [input.name || input.id, input.value])
  )`);
}

async function setInputs(cdp, values) {
  for (const [name, value] of Object.entries(values)) {
    const selector = `input[name=${JSON.stringify(name)}], input#${cssEscape(name)}`;
    await tapDom(cdp, selector);
    await Bun.sleep(200);
    let currentLength = await cdp.evaluate(
      `document.querySelector(${JSON.stringify(selector)})?.value.length ?? 0`
    );
    if (currentLength > 0) {
      adb(['shell', 'input', 'keyevent', 'KEYCODE_MOVE_END']);
      while (currentLength > 0) {
        const expectedLength = currentLength - 1;
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          adb(['shell', 'input', 'keyevent', 'KEYCODE_DEL']);
          await Bun.sleep(75);
          const actualLength = await cdp.evaluate(
            `document.querySelector(${JSON.stringify(selector)})?.value.length ?? -1`
          );
          if (actualLength === expectedLength) break;
          if (actualLength !== currentLength || attempt === 5) {
            fail(`${name}: could not clear field (expected length ${expectedLength}, got ${actualLength})`);
          }
        }
        currentLength = expectedLength;
      }
    }
    let typed = '';
    for (const character of value) {
      const before = typed;
      const expectedValue = before + character;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        adb(['shell', 'input', 'text', character]);
        await Bun.sleep(75);
        const current = await cdp.evaluate(
          `document.querySelector(${JSON.stringify(selector)})?.value ?? null`
        );
        if (current === expectedValue) break;
        if (current !== before || attempt === 5) {
          fail(`${name}: typed ${JSON.stringify(expectedValue)}, got ${JSON.stringify(current)}`);
        }
      }
      typed = expectedValue;
    }
  }
}

function assertInputs(actual, expected, id) {
  for (const [name, value] of Object.entries(expected)) {
    if (actual[name] !== value) {
      fail(`${id}: ${name} expected ${JSON.stringify(value)}, got ${JSON.stringify(actual[name])}`);
    }
  }
}

async function submitAndExpectSave(cdp, id) {
  await tapDom(cdp, 'form.autofill-test__form button[type="submit"]');
  const commit = await cdp.evaluate(`(async () => {
    try {
      await window.Capacitor.nativePromise('Autofill', 'commitActiveSession', {});
      return { ok: true, platform: window.Capacitor.getPlatform?.() };
    } catch (error) {
      return { ok: false, message: String(error), platform: window.Capacitor?.getPlatform?.() };
    }
  })()`);
  if (!commit.ok) fail(`${id}: native autofill commit failed (${commit.platform}): ${commit.message}`);
  let lastHierarchy = '';
  let hierarchy;
  try {
    hierarchy = await waitFor(async () => {
      if (isSaveDialogLogged()) return '<save-dialog-confirmed-by-system-log />';
      lastHierarchy = dumpUi();
      return isSavePrompt(lastHierarchy) ? lastHierarchy : null;
    }, `${id}: Authwell save prompt`, 12_000);
  } catch (error) {
    console.error(`Visible Android UI after ${id} submission:\n${summarizeUi(lastHierarchy)}`);
    throw error;
  }
  const dismiss = findNode(hierarchy, (node) =>
    node.resourceId === 'android:id/autofill_save_no' ||
    ['Not now', 'No thanks', 'Cancel'].includes(node.text)
  );
  if (dismiss) tapBounds(dismiss.bounds);
  else adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  await Bun.sleep(400);
}

async function submitAndExpectNoSave(cdp, id) {
  await tapDom(cdp, 'form.autofill-test__form button[type="submit"]');
  await cdp.evaluate(`window.Capacitor.nativePromise('Autofill', 'commitActiveSession', {})`);
  await Bun.sleep(1_500);
  const hierarchy = dumpUi();
  if (isSavePrompt(hierarchy) || isSaveDialogLogged()) {
    fail(`${id}: Android offered to save a one-time code`);
  }
}

async function assertCredentialPickerAbsent() {
  await Bun.sleep(1_200);
  const hierarchy = dumpUi();
  if (hierarchy.includes('android:id/autofill_dataset_picker')) {
    fail('Android offered a saved credential for a field that must not receive one');
  }
}

async function assertSavePromptAbsent() {
  await Bun.sleep(1_500);
  if (isSavePrompt(dumpUi()) || isSaveDialogLogged()) {
    fail('Android offered to save a form with no credentials');
  }
}

function isSavePrompt(xml) {
  return xml.includes('android:id/autofill_save') ||
    xml.includes('Save this login to Authwell') ||
    xml.includes('Continue signing in to save this login to Authwell');
}

function isSaveDialogLogged() {
  const logs = adb(['logcat', '-d', '-v', 'brief', '-s', 'SaveUi:I', '*:S']);
  return logs.includes('Showing save dialog:') && logs.includes('Authwell');
}

function dumpUi() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    adb(['shell', 'rm', '-f', UI_DUMP_PATH], { allowFailure: true });
    adb(['shell', 'uiautomator', 'dump', UI_DUMP_PATH], { allowFailure: true });
    const xml = adb(['shell', 'cat', UI_DUMP_PATH], { allowFailure: true });
    if (xml.includes('<hierarchy') && xml.includes('</hierarchy>')) return xml;
    if (attempt < 3) Bun.sleepSync(250);
  }
  fail('Android UIAutomator did not return a complete hierarchy after 3 attempts');
}

function findNode(xml, predicate) {
  for (const match of xml.matchAll(/<node\s+([^>]+?)(?:\/>|>)/g)) {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attributes[attribute[1]] = decodeXml(attribute[2]);
    }
    const node = {
      text: attributes.text ?? '',
      contentDescription: attributes['content-desc'] ?? '',
      resourceId: attributes['resource-id'] ?? '',
      bounds: parseBounds(attributes.bounds),
    };
    if (predicate(node)) return node;
  }
  return null;
}

function summarizeUi(xml) {
  const visible = [];
  for (const match of xml.matchAll(/<node\s+([^>]+?)(?:\/>|>)/g)) {
    const attributes = Object.fromEntries(
      [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)]
        .map((attribute) => [attribute[1], decodeXml(attribute[2])])
    );
    if (attributes.text || attributes['content-desc'] || attributes['resource-id']) {
      visible.push([
        attributes['resource-id'],
        attributes.text,
        attributes['content-desc'],
      ].filter(Boolean).join(' · '));
    }
  }
  return [...new Set(visible)].join('\n');
}

function parseBounds(value = '') {
  const match = /^\[(\d+),(\d+)]\[(\d+),(\d+)]$/.exec(value);
  if (!match) return null;
  return { left: +match[1], top: +match[2], right: +match[3], bottom: +match[4] };
}

function tapBounds(bounds) {
  if (!bounds) fail('Could not determine Android UI bounds');
  adb([
    'shell', 'input', 'tap',
    String(Math.round((bounds.left + bounds.right) / 2)),
    String(Math.round((bounds.top + bounds.bottom) / 2)),
  ]);
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function escapeForJs(value) {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function cssEscape(value) {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0).toString(16)} `);
}

async function waitFor(check, description, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(150);
  }
  fail(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const resolve = this.pending.get(message.id);
      if (!resolve) return;
      this.pending.delete(message.id);
      resolve(message);
    });
  }

  static async connect(port) {
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null);
      if (!response?.ok) return null;
      const targets = await response.json();
      return targets.find((candidate) => candidate.type === 'page') ?? null;
    }, 'WebView DevTools target');
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });
    return new CdpClient(socket);
  }

  async send(method, params = {}) {
    const id = ++this.nextId;
    const response = new Promise((resolveResponse) => this.pending.set(id, resolveResponse));
    this.socket.send(JSON.stringify({ id, method, params }));
    return await response;
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.error) throw new Error(response.error.message);
    if (response.result?.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.exception?.description ?? 'WebView evaluation failed');
    }
    return response.result?.result?.value;
  }

  async evaluateJson(expression) {
    const encoded = await this.evaluate(`JSON.stringify(${expression})`);
    return JSON.parse(encoded);
  }

  close() {
    this.socket.close();
  }
}

function adb(args, settings = {}) {
  return run([adbExecutable, '-s', serial, ...args], settings);
}

function run(command, { cwd = ROOT, allowFailure = false, inherit = false } = {}) {
  const result = Bun.spawnSync({
    cmd: command,
    cwd,
    stdout: inherit ? 'inherit' : 'pipe',
    stderr: inherit ? 'inherit' : 'pipe',
  });
  const stdout = inherit ? '' : new TextDecoder().decode(result.stdout);
  const stderr = inherit ? '' : new TextDecoder().decode(result.stderr);
  if (result.exitCode !== 0 && !allowFailure) {
    fail(`${command.join(' ')} failed (${result.exitCode})\n${stderr || stdout}`);
  }
  return stdout;
}

function findRunningEmulator() {
  const output = run([adbExecutable, 'devices']);
  return output.split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find(([id, state]) => id?.startsWith('emulator-') && state === 'device')?.[0];
}

function parseOptions(args) {
  const parsed = { serial: undefined, skipBuild: false, case: undefined };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--skip-build') parsed.skipBuild = true;
    else if (args[index] === '--serial') parsed.serial = args[++index];
    else if (args[index] === '--case') parsed.case = args[++index];
    else if (args[index] === '--help' || args[index] === '-h') {
      console.log(`Usage: bun run android:test:autofill [-- --serial emulator-5554] [--case standard] [--skip-build]\n\nBuilds, installs, seeds, and drives the /test AutoFill scenarios on an Android emulator.`);
      process.exit(0);
    } else fail(`Unknown option: ${args[index]}`);
  }
  if (parsed.case !== undefined && !CASE_IDS.includes(parsed.case)) {
    fail(`Unknown AutoFill case: ${parsed.case}`);
  }
  return parsed;
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
