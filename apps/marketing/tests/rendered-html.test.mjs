import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  return readFile(new URL("../out/index.html", import.meta.url), "utf8");
}

test("exports the Authwell marketing page", async () => {
  const html = await render();
  assert.match(html, /<title>Authwell \| Your passwords\. Your infrastructure\. Your control\.<\/title>/i);
  assert.match(html, /Your passwords/);
  assert.match(html, /Your infrastructure/);
  assert.match(html, /Your control/);
  assert.match(html, /Checking registration/);
  assert.match(html, /One vault\. Every way in\./);
  assert.equal((html.match(/class="platform-icon"/g) ?? []).length, 8);
  assert.match(html, /Security explained without theatre\./);
  assert.match(html, /Use our server, or bring your own\./);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships product metadata and brand assets", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../out/brand/authwell-portal-pattern.webp", import.meta.url)),
    access(new URL("../out/brand/authwell-mark.svg", import.meta.url)),
  ]);

  assert.match(page, /https:\/\/vault\.authwell\.app/);
  assert.match(page, /https:\/\/api\.authwell\.app/);
  assert.match(page, /authwell-mark\.svg/);
  assert.doesNotMatch(page, /authwell-mark\.png/);
  assert.match(layout, /export const metadata: Metadata/);
  assert.match(layout, /metadataBase: new URL\("https:\/\/authwell\.app"\)/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(packageJson, /"name": "@lockbox\/marketing"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
