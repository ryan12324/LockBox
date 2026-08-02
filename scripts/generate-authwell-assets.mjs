import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const brandDir = resolve(root, 'assets/branding/authwell');

async function ensureParent(target) {
  await mkdir(dirname(target), { recursive: true });
}

async function write(target, contents) {
  await ensureParent(target);
  await writeFile(target, contents);
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function rgbToHex(rgb) {
  return `#${rgb
    .split(',')
    .map((channel) => Number.parseInt(channel.trim(), 10).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

async function trimBox(svg, padding = 10) {
  const { info } = await sharp(Buffer.from(svg))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = -(info.trimOffsetLeft ?? 0);
  const top = -(info.trimOffsetTop ?? 0);
  return {
    x: Math.max(0, left - padding),
    y: Math.max(0, top - padding),
    width: info.width + padding * 2,
    height: info.height + padding * 2,
  };
}

function boxValue(box) {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

function canonicalSvg({ title, viewBox, transform, markGroups, wordmarkGroups = [], textColor }) {
  const wordmark =
    wordmarkGroups.length === 0
      ? ''
      : `\n    <g id="wordmark" fill="${textColor}">\n${wordmarkGroups
          .map((group) => `      ${group}`)
          .join('\n')}\n    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title">
  <title id="title">${xmlEscape(title)}</title>
  <g transform="${transform}">
    <g id="mark">
${markGroups.map((group) => `      ${group}`).join('\n')}
    </g>${wordmark}
  </g>
</svg>
`;
}

function androidVector(markGroups, monochrome = false) {
  const paths = markGroups.map((group) => {
    const transform = group.match(/transform="matrix\(1,0,0,1,([^,]+),([^\)]+)\)"/);
    const pathData = group.match(/<path d="([^"]+)"/);
    const fill = group.match(/fill:rgb\(([^\)]+)\)/);
    if (!transform || !pathData || !fill) {
      throw new Error('The supplied Authwell mark contains an unsupported path structure.');
    }
    return `    <group android:translateX="${transform[1]}" android:translateY="${transform[2]}">
        <path
            android:fillColor="${monochrome ? '#FFFFFFFF' : rgbToHex(fill[1])}"
            android:fillType="nonZero"
            android:pathData="${pathData[1]}" />
    </group>`;
  });

  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="370.315"
    android:viewportHeight="370.315">
${paths.join('\n')}
</vector>
`;
}

async function importLogoSource(sourcePath) {
  const source = await readFile(sourcePath, 'utf8');
  const viewBoxMatch = source.match(/viewBox="([^"]+)"/);
  const transformMatch = source.match(/<g id="Page-1"[^>]*transform="([^"]+)"/);
  const groups = [...source.matchAll(/<g transform="matrix\(1,0,0,1,[^"]+\)">[\s\S]*?<\/g>/g)].map(
    (match) => match[0],
  );
  if (!viewBoxMatch || !transformMatch || groups.length !== 11) {
    throw new Error('Expected the supplied Authwell SVG to contain one mark and eight letter paths.');
  }

  const markGroups = groups.slice(0, 3);
  const wordmarkGroups = groups.slice(3);
  const sourceViewBox = viewBoxMatch[1];
  const transform = transformMatch[1];
  const transparentSource = (selectedGroups) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sourceViewBox}"><g transform="${transform}">${selectedGroups.join('')}</g></svg>`;
  const logoBox = await trimBox(transparentSource(groups));
  const markBox = await trimBox(transparentSource(markGroups));

  const lightLogo = canonicalSvg({
    title: 'Authwell',
    viewBox: boxValue(logoBox),
    transform,
    markGroups,
    wordmarkGroups,
    textColor: '#10162F',
  });
  const darkLogo = canonicalSvg({
    title: 'Authwell',
    viewBox: boxValue(logoBox),
    transform,
    markGroups,
    wordmarkGroups,
    textColor: '#F7F8FC',
  });
  const mark = canonicalSvg({
    title: 'Authwell mark',
    viewBox: boxValue(markBox),
    transform,
    markGroups,
  });
  const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title">
  <title id="title">Authwell app icon</title>
  <rect width="1024" height="1024" rx="224" fill="#10162F"/>
  <svg x="148" y="148" width="728" height="728" viewBox="${boxValue(markBox)}">
    <g transform="${transform}">
${markGroups.map((group) => `      ${group}`).join('\n')}
    </g>
  </svg>
</svg>
`;

  await Promise.all([
    write(resolve(brandDir, 'authwell-logo-horizontal.svg'), lightLogo),
    write(resolve(brandDir, 'authwell-logo-horizontal-dark.svg'), darkLogo),
    write(resolve(brandDir, 'authwell-mark.svg'), mark),
    write(resolve(brandDir, 'authwell-app-icon.svg'), appIcon),
  ]);

  const androidRes = resolve(root, 'apps/mobile/android/app/src/main/res');
  const foreground = androidVector(markGroups);
  const monochrome = androidVector(markGroups, true);
  await Promise.all([
    write(resolve(androidRes, 'drawable/authwell_launcher_foreground.xml'), foreground),
    write(resolve(androidRes, 'drawable/lockbox_launcher_foreground.xml'), foreground),
    write(resolve(androidRes, 'drawable-v24/ic_launcher_foreground.xml'), foreground),
    write(resolve(androidRes, 'drawable/authwell_launcher_monochrome.xml'), monochrome),
  ]);
}

const sourceFlagIndex = process.argv.indexOf('--source');
if (sourceFlagIndex !== -1) {
  const sourcePath = process.argv[sourceFlagIndex + 1];
  if (!sourcePath) throw new Error('Pass an SVG path after --source.');
  await importLogoSource(resolve(sourcePath));
}

const iconSvg = await readFile(resolve(brandDir, 'authwell-app-icon.svg'));
const markSvg = await readFile(resolve(brandDir, 'authwell-mark.svg'));
const logoSvg = await readFile(resolve(brandDir, 'authwell-logo-horizontal.svg'));
const darkLogoSvg = await readFile(resolve(brandDir, 'authwell-logo-horizontal-dark.svg'));

async function render(source, target, width, height = width) {
  await ensureParent(target);
  await sharp(source)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(target);
}

async function renderWidth(source, target, width) {
  await ensureParent(target);
  await sharp(source).resize({ width }).png().toFile(target);
}

async function transparentMark(size, markSize, monochrome = false) {
  const pipeline = sharp(markSvg).resize(markSize, markSize, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  let input;
  if (monochrome) {
    const alpha = await pipeline.clone().ensureAlpha().extractChannel('alpha').raw().toBuffer();
    input = await sharp({
      create: { width: markSize, height: markSize, channels: 3, background: '#FFFFFF' },
    })
      .joinChannel(alpha, { raw: { width: markSize, height: markSize, channels: 1 } })
      .png()
      .toBuffer();
  } else {
    input = await pipeline.png().toBuffer();
  }
  return sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
    .composite([{ input, gravity: 'centre' }])
    .png()
    .toBuffer();
}

const appIconSizes = [16, 32, 48, 96, 128, 180, 192, 512];
for (const size of appIconSizes) {
  await render(iconSvg, resolve(brandDir, `app-icons/authwell-${size}.png`), size);
}

await render(iconSvg, resolve(brandDir, 'authwell-app-icon.png'), 1024);
await render(markSvg, resolve(brandDir, 'authwell-mark.png'), 512);
await renderWidth(logoSvg, resolve(brandDir, 'authwell-logo-horizontal.png'), 1120);
await renderWidth(darkLogoSvg, resolve(brandDir, 'authwell-logo-horizontal-dark.png'), 1120);

// Maintain the legacy asset paths used by older packaging and documentation.
const legacyBrandDir = resolve(root, 'assets/brand');
await render(iconSvg, resolve(legacyBrandDir, 'lockbox-app-icon-v2-master.png'), 1024);
await render(markSvg, resolve(legacyBrandDir, 'lockbox-mark-v2.png'), 512);
await renderWidth(logoSvg, resolve(legacyBrandDir, 'lockbox-logo-horizontal-v2.png'), 1120);
for (const size of appIconSizes) {
  await render(iconSvg, resolve(legacyBrandDir, `app-icons/lockbox-${size}.png`), size);
}

const webBrandDir = resolve(root, 'apps/web/public/brand');
for (const size of appIconSizes) {
  await render(iconSvg, resolve(webBrandDir, `app-icons/authwell-${size}.png`), size);
}
await render(iconSvg, resolve(webBrandDir, 'authwell-app-icon.png'), 512);
await render(markSvg, resolve(webBrandDir, 'authwell-mark.png'), 256);
await renderWidth(logoSvg, resolve(webBrandDir, 'authwell-logo-horizontal.png'), 560);
await renderWidth(darkLogoSvg, resolve(webBrandDir, 'authwell-logo-horizontal-dark.png'), 560);

const marketingBrandDir = resolve(root, 'apps/marketing/public/brand');
await render(iconSvg, resolve(marketingBrandDir, 'authwell-app-icon.png'), 512);
await render(markSvg, resolve(marketingBrandDir, 'authwell-mark.png'), 256);
await renderWidth(logoSvg, resolve(marketingBrandDir, 'authwell-logo-horizontal.png'), 560);
await renderWidth(darkLogoSvg, resolve(marketingBrandDir, 'authwell-logo-horizontal-dark.png'), 560);

const extensionDir = resolve(root, 'apps/extension/public');
for (const size of [16, 32, 48, 96, 128]) {
  await render(iconSvg, resolve(extensionDir, `icon/${size}.png`), size);
}
await renderWidth(logoSvg, resolve(extensionDir, 'brand/authwell-logo-horizontal.png'), 560);

const patternWidth = 1672;
const patternHeight = 941;
const markSource = markSvg.toString('utf8');
function recoloredMark({ outer, inner, bookmark }) {
  return Buffer.from(
    markSource
      .replaceAll('rgb(90,84,252)', outer)
      .replaceAll('rgb(29,210,199)', inner)
      .replaceAll('rgb(254,93,90)', bookmark),
  );
}

const patternMarks = await Promise.all(
  [
    [-150, -310, 620, { outer: '#5A54FC', inner: '#1DD2C7', bookmark: '#FE5D5A' }],
    [965, 18, 210, { outer: '#F5C84C', inner: '#5A54FC', bookmark: '#1DD2C7' }],
    [930, 235, 350, { outer: '#1DD2C7', inner: '#FE5D5A', bookmark: '#5A54FC' }],
    [1165, 370, 710, { outer: '#FE5D5A', inner: '#F5C84C', bookmark: '#1DD2C7' }],
    [-120, 680, 430, { outer: '#F5C84C', inner: '#1DD2C7', bookmark: '#FE5D5A' }],
    [390, 760, 270, { outer: '#1DD2C7', inner: '#5A54FC', bookmark: '#F5C84C' }],
  ].map(async ([left, top, size, palette]) => ({
    input: await sharp(recoloredMark(palette))
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer(),
    left,
    top,
  })),
);
const pattern = await sharp({
  create: { width: patternWidth, height: patternHeight, channels: 4, background: '#10162F' },
})
  .composite(patternMarks)
  .png()
  .toBuffer();
await write(resolve(brandDir, 'authwell-portal-pattern-v1.png'), pattern);
await ensureParent(resolve(webBrandDir, 'authwell-portal-pattern.webp'));
await sharp(pattern).webp({ quality: 90 }).toFile(resolve(webBrandDir, 'authwell-portal-pattern.webp'));
await ensureParent(resolve(marketingBrandDir, 'authwell-portal-pattern.webp'));
await sharp(pattern)
  .webp({ quality: 90 })
  .toFile(resolve(marketingBrandDir, 'authwell-portal-pattern.webp'));

const ogWidth = 1732;
const ogHeight = 906;
const ogMark = await sharp(markSvg)
  .resize(820, 820, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();
const ogLogo = await sharp(darkLogoSvg).resize({ width: 620 }).png().toBuffer();
const ogCopy = Buffer.from(`<svg width="${ogWidth}" height="${ogHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="aqua" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#1DD2C7"/><stop offset="1" stop-color="#5A54FC"/></linearGradient>
  </defs>
  <style>
    .headline { font: 700 76px Arial, Helvetica, sans-serif; letter-spacing: -2px; }
    .support { font: 400 32px Arial, Helvetica, sans-serif; fill: #D8DDF0; }
  </style>
  <text x="108" y="410" class="headline" fill="#F7F8FC">Your passwords.</text>
  <text x="108" y="506" class="headline" fill="url(#aqua)">Your infrastructure.</text>
  <text x="108" y="602" class="headline" fill="#FF5D5A">Your control.</text>
  <text x="112" y="700" class="support">End-to-end encrypted. Hosted or self-hosted.</text>
</svg>`);
await sharp({
  create: { width: ogWidth, height: ogHeight, channels: 4, background: '#10162F' },
})
  .composite([
    { input: ogMark, left: 1120, top: 150 },
    { input: ogLogo, left: 108, top: 72 },
    { input: ogCopy, left: 0, top: 0 },
  ])
  .png()
  .toFile(resolve(root, 'apps/marketing/public/og.png'));

const androidRes = resolve(root, 'apps/mobile/android/app/src/main/res');
const androidIcons = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];
for (const [density, size] of androidIcons) {
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/ic_launcher.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/ic_launcher_round.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/authwell_launcher.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/authwell_launcher_round.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/lockbox_launcher.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/lockbox_launcher_round.png`), size);
  const foregroundSize = Math.round(size * 2.25);
  await write(
    resolve(androidRes, `mipmap-${density}/ic_launcher_foreground.png`),
    await transparentMark(foregroundSize, Math.round(foregroundSize * 0.61)),
  );
}
await write(
  resolve(androidRes, 'drawable-nodpi/lockbox_launcher_foreground_v2.png'),
  await transparentMark(432, 264),
);
await write(
  resolve(androidRes, 'drawable-nodpi/lockbox_launcher_monochrome_v2.png'),
  await transparentMark(432, 264, true),
);

const splashSizes = [
  ['drawable/splash.png', 480, 320],
  ['drawable-port-mdpi/splash.png', 320, 480],
  ['drawable-port-hdpi/splash.png', 480, 800],
  ['drawable-port-xhdpi/splash.png', 720, 1280],
  ['drawable-port-xxhdpi/splash.png', 960, 1600],
  ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ['drawable-land-mdpi/splash.png', 480, 320],
  ['drawable-land-hdpi/splash.png', 800, 480],
  ['drawable-land-xhdpi/splash.png', 1280, 720],
  ['drawable-land-xxhdpi/splash.png', 1600, 960],
  ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
];
for (const [path, width, height] of splashSizes) {
  const markSize = Math.round(Math.min(width, height) * 0.34);
  const mark = await sharp(markSvg)
    .resize(markSize, markSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  await sharp({ create: { width, height, channels: 4, background: '#10162F' } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(resolve(androidRes, path));
}

console.log('Generated Authwell vectors and raster assets for web, marketing, extension, and Android.');
