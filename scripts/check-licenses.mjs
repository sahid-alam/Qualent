// Fails if any installed package has a license outside the allowlist.
import { readFileSync } from "node:fs";

const ALLOWED = new Set([
  "MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "CC0-1.0",
  "BlueOak-1.0.0", "Unlicense", "MIT-0",
]);

// Reviewed exceptions: not copied into our code, and no copyleft duty on it.
const EXCEPTIONS = [
  { match: /(^|\/)node_modules\/lightningcss/, reason: "MPL-2.0, build tool only" },
  { match: /^node_modules\/@tailwindcss\/oxide/, reason: "build tool" },
  { match: /^node_modules\/caniuse-lite$/, reason: "CC-BY-4.0, browser data" },
  { match: /^node_modules\/@img\/sharp-/, reason: "LGPL libvips, unmodified prebuilt binary from Next" },
  { match: /^node_modules\/axe-core$/, reason: "MPL-2.0, lint tool only" },
  { match: /^node_modules\/argparse$/, reason: "Python-2.0, lint tool only" },
];

function allowed(license) {
  if (typeof license !== "string") return false;
  const expression = license.replace(/[()]/g, "");
  if (expression.includes(" AND ")) {
    return expression.split(" AND ").every((part) => allowed(part));
  }
  return expression.split(" OR ").some((part) => ALLOWED.has(part.trim()));
}

const { packages } = JSON.parse(readFileSync("package-lock.json", "utf8"));
const bad = Object.entries(packages).filter(
  ([path, info]) =>
    path &&
    !allowed(info.license) &&
    !EXCEPTIONS.some((exception) => exception.match.test(path)),
);

for (const [path, info] of bad) console.error(`${path}: ${info.license ?? "no license"}`);
process.exit(bad.length ? 1 : 0);
