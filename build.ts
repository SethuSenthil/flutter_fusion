// Build/release step: mirror the CLI source into docs/ (served via GitHub
// Pages at flutter-fusion.sethusenthil.com) and write version.json.
//
//   deno task build   # or: deno run --allow-read --allow-write build.ts
//
// The hosted main.ts imports its modules with relative paths (./lib/*), so
// docs/ must contain a faithful copy of both main.ts and lib/ for the
// URL-based `deno install` to resolve.

import * as path from "jsr:@std/path@1.1.6";
import { copy } from "jsr:@std/fs@1.0.24";
import { VERSION } from "./lib/meta.ts";

const root = path.dirname(path.fromFileUrl(import.meta.url));
const docs = path.join(root, "docs");

await Deno.copyFile(path.join(root, "main.ts"), path.join(docs, "main.ts"));
await copy(path.join(root, "lib"), path.join(docs, "lib"), { overwrite: true });

const versionData = {
  version: VERSION,
  changelog:
    "Fixes the self-update mechanism: reloads the module cache so upgrades actually install the new version, and exits after upgrading so the fresh version is used.",
};
await Deno.writeTextFile(
  path.join(docs, "version.json"),
  JSON.stringify(versionData),
);

console.log(`✅ Built docs for v${VERSION}`);
