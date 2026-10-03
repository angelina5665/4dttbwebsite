import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(resolve(root, name), "utf8").replace(/\r\n/g, "\n");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const index = read("index.html");
const style = (html) => html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "";

assert.equal((index.match(/<link rel="canonical" href="https:\/\/4dresult1\.com\/">/g) ?? []).length, 1);
assert.equal((index.match(/<h1 class="page-title" data-i18n="homeTitle">4D Result Malaysia<\/h1>/g) ?? []).length, 1);
for (const asset of ["site-language.css", "promo-banner.css", "site-language.mjs", "promo-banner.mjs", "sponsor-tab.mjs"]) {
  assert.ok(index.includes(asset), `Homepage is missing ${asset}`);
}
assert.ok(index.includes("data-language-switcher"), "Homepage is missing the language switcher");
assert.ok(index.includes('id="sponsor-tab-notice"'), "Homepage is missing the sponsored-tab disclosure");
for (const id of ["malaysia-results", "singapore-results", "sabah-sarawak-results"]) {
  assert.ok(index.includes(`id: "${id}"`), `Missing layout id ${id}`);
  assert.ok(index.includes(`href: "#${id}"`), `Missing working hash link ${id}`);
}
assert.equal((index.match(/https:\/\/ttbet\.fun\/RFAA9570A03/g) ?? []).length, 3);
assert.equal((index.match(/rel="noopener sponsored"/g) ?? []).length, 6);

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
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert.deepEqual(sitemapUrls, [
  "https://4dresult1.com/",
  "https://4dresult1.com/slot-malaysia.html",
  "https://4dresult1.com/chinese-number-symbolism.html",
  "https://4dresult1.com/dictionary.html",
  "https://4dresult1.com/4d-history.html",
]);
for (const url of sitemapUrls.slice(1)) {
  const relativePath = new URL(url).pathname.slice(1);
  assert.ok(index.includes(`href="${relativePath}"`), `Homepage is missing a link to ${url}`);
}

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

const retiredDomain = "rujuk" + "4d";
for (const file of ["index.html", "privacy.html", "disclaimer.html", "robots.txt", "sitemap.xml", "vercel.json", "qa/preview-server.mjs", "qa/verify-seo-release.mjs"]) {
  assert.ok(!read(file).toLowerCase().includes(retiredDomain), `Retired domain remains in ${file}`);
}
assert.equal(read("CNAME"), "4dresult1.com");

console.log(JSON.stringify({
  status: "PASS",
  homepageCssSha256: sha256(style(index)),
  canonical: "https://4dresult1.com/",
  sitemapUrls: sitemapUrls.length,
  hostRedirects: 4,
  repairedInternalCategoryLinks: 3,
  linkedSitemapContentPages: sitemapUrls.length - 1,
  ttbetAffiliateDestinationsUnchanged: 3,
  sponsoredLinkAttributes: 6,
}, null, 2));
