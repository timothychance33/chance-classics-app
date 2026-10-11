import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const out = path.join(root, "out");
if (!fs.existsSync(out)) {
  console.log("no static export; Vercel redirects in vercel.json cover the old paths");
  process.exit(0);
}

function html(destination) {
  const href = destination.startsWith("http") ? destination : destination;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting…</title>
<link rel="canonical" href="${href.startsWith("http") ? href : "https://www.chanceclassics.com" + href}">
<meta http-equiv="refresh" content="0; url=${href}">
<script>location.replace(${JSON.stringify(href)});</script>
</head>
<body>
<p>This page has moved. <a href="${href}">Continue</a>.</p>
</body>
</html>
`;
}

let written = 0;
for (const rule of vercel.redirects) {
  if (rule.source.includes(":")) continue;
  const parts = rule.source.split("/").filter(Boolean);
  const dir = path.join(out, ...parts);
  const file = path.join(dir, "index.html");
  if (fs.existsSync(file)) {
    console.log("skip existing", rule.source);
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, html(rule.destination));
  written += 1;
}
console.log(`wrote ${written} static redirects`);
