import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] || 4178);
const root = process.argv[3]
  ? resolve(process.argv[3])
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const target = resolve(root, `.${pathname}`);
  const inRoot = target === root || target.startsWith(root + sep);
  if (inRoot && existsSync(target) && statSync(target).isFile()) {
    response.writeHead(200, { "content-type": types[extname(target)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(readFileSync(target));
    return;
  }

  const notFound = resolve(root, "404.html");
  response.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(existsSync(notFound) ? readFileSync(notFound) : "<!doctype html><title>Not Found</title>");
}).listen(port, "127.0.0.1", () => {
  console.log(`Preview ready at http://127.0.0.1:${port}`);
});
