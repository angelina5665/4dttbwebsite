import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(resolve(root, name), "utf8").replace(/\r\n/g, "\n");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const baseline = execFileSync(
  "git",
  ["show", "d3de9df393d6dc8812a1a1ec87c1ebb9fab07f09:index.html"],
  { cwd: root, encoding: "utf8" },
).replace(/\r\n/g, "\n");
const index = read("index.html");

const style = (html) => html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "";
assert.equal(style(index), style(baseline), "Homepage CSS changed");

let reverted = index
  .replace('<link rel="canonical" href="https://4dresult1.com/">\n', "")
  .replace('{ id: "malaysia-results", title: "4D RESULT MALAYSIA", href: "#malaysia-results",', '{ title: "4D RESULT MALAYSIA", href: "malaysia-4d-result.html",')
  .replace('{ id: "singapore-results", title: "4D RESULT SINGAPORE", href: "#singapore-results",', '{ title: "4D RESULT SINGAPORE", href: "singapore-4d-result.html",')
  .replace('{ id: "sabah-sarawak-results", title: "4D RESULT SABAH SARAWAK", href: "#sabah-sarawak-results",', '{ title: "4D RESULT SABAH SARAWAK", href: "sarawak-4d-result.html",')
  .replace('return \'<div class="section-bar" id="\' + esc(sec.id) + \'"><h2>', 'return \'<div class="section-bar"><h2>');
assert.equal(reverted, baseline, "index.html contains changes outside the approved nonvisual set");

assert.equal((index.match(/<link rel="canonical" href="https:\/\/4dresult1\.com\/">/g) ?? []).length, 1);
for (const id of ["malaysia-results", "singapore-results", "sabah-sarawak-results"]) {
  assert.ok(index.includes(`id: "${id}"`), `Missing layout id ${id}`);
  assert.ok(index.includes(`href: "#${id}"`), `Missing working hash link ${id}`);
}
assert.equal((index.match(/https:\/\/ttbet\.fun\/RFAA9570A03/g) ?? []).length, 3);
assert.equal((index.match(/rel="noopener sponsored"/g) ?? []).length, 3);

const config = JSON.parse(read("vercel.json"));
assert.ok(!("cleanUrls" in config));
assert.ok(!("trailingSlash" in config));
assert.deepEqual(
  config.redirects.map((item) => `${item.has?.[0]?.value}|${item.source}`).sort(),
  [
    "4dttb-psi.vercel.app|/",
    "4dttb-psi.vercel.app|/:path*",
    "4dttb.vercel.app|/",
    "4dttb.vercel.app|/:path*",
  ],
);
assert.ok(config.redirects.every((item) => item.permanent === true));
assert.ok(config.redirects.every((item) => item.destination === (item.source === "/" ? "https://4dresult1.com/" : "https://4dresult1.com/:path*")));

assert.equal(
  read("robots.txt"),
  "User-agent: *\nAllow: /\n\nSitemap: https://4dresult1.com/sitemap.xml\n",
);
const sitemap = read("sitemap.xml");
assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]), ["https://4dresult1.com/"]);

for (const page of ["privacy", "disclaimer"]) {
  const html = read(`${page}.html`);
  assert.ok(html.includes('<meta name="robots" content="noindex,follow">'));
  assert.ok(html.includes(`<link rel="canonical" href="https://4dresult1.com/${page}.html">`));
  assert.ok(html.includes('href="/legal.css"'));
  assert.ok(html.includes('href="/"'));
  assert.ok(html.includes("<h1>"));
}
const notFound = read("404.html");
assert.ok(notFound.includes('<meta name="robots" content="noindex,follow">'));
assert.ok(!notFound.includes('rel="canonical"'));
assert.ok(notFound.includes('href="/legal.css"'));

execFileSync("git", ["diff", "--quiet", "d3de9df393d6dc8812a1a1ec87c1ebb9fab07f09", "--", "CNAME", "results.json", "scrape.py", ".github/workflows/update-results.yml"], { cwd: root });

const retiredDomain = "rujuk" + "4d";
for (const file of ["index.html", "privacy.html", "disclaimer.html", "robots.txt", "sitemap.xml", "vercel.json", "qa/preview-server.mjs", "qa/verify-seo-release.mjs"]) {
  assert.ok(!read(file).toLowerCase().includes(retiredDomain), `Retired domain remains in ${file}`);
}
assert.equal(read("CNAME"), "4dresult1.com");

console.log(JSON.stringify({
  status: "PASS",
  baselineCommit: "d3de9df393d6dc8812a1a1ec87c1ebb9fab07f09",
  homepageCssSha256: sha256(style(index)),
  canonical: "https://4dresult1.com/",
  sitemapUrls: 1,
  hostRedirects: 4,
  repairedInternalCategoryLinks: 3,
  affiliateDestinationsUnchanged: 3,
}, null, 2));
