// Fails on physical CSS classes. Use logical ones: ms-, pe-, text-start, border-s.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PATTERN =
  /(?<![\w-])-?((?:ml|mr|pl|pr|left|right)-[\w[(.]+|text-(?:left|right)\b|float-(?:left|right)\b|(?:border|rounded)-[lr](?!\w)(?:-[\w[(.]+)?)/g;

export function findPhysicalClasses(text) {
  return [...text.matchAll(PATTERN)].map((match) => match[1]);
}

if (import.meta.main) {
  let failed = false;
  for (const folder of ["app", "components"]) {
    let entries = [];
    try {
      entries = readdirSync(folder, { recursive: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/\.(tsx|css)$/.test(entry)) continue;
      const path = join(folder, entry);
      const found = findPhysicalClasses(readFileSync(path, "utf8"));
      if (found.length) {
        failed = true;
        console.error(`${path}: ${found.join(", ")}`);
      }
    }
  }
  process.exit(failed ? 1 : 0);
}
