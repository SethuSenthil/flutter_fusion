// Self-update check. Compares the running version against the hosted
// version.json and offers to re-run the global install. This runs before
// project detection, so it is intentionally NOT written to flutter_fusion.log.

import { greaterThan, parse as parseSemver } from "jsr:@std/semver@1.0.8";
import { VERSION } from "./meta.ts";

const INSTALL_URL = "https://flutter-fusion.sethusenthil.com/main.ts";
const VERSION_URL = "https://flutter-fusion.sethusenthil.com/version.json";

// Keep in sync with the install command in README.md and deno.json.
const INSTALL_ARGS = [
  "install",
  "-g",
  "-f",
  // Bypass Deno's module cache for the hosted source, otherwise `install -f`
  // just re-creates the shim over the stale cached modules and the "upgrade"
  // reinstalls the same old version.
  `--reload=${new URL(INSTALL_URL).origin}`,
  "-n",
  "flutter-fusion",
  "--allow-read",
  "--allow-env",
  "--allow-run",
  "--allow-write",
  "--allow-sys",
  "--allow-net",
  INSTALL_URL,
];

export async function checkForUpdates(): Promise<void> {
  try {
    const res = await fetch(VERSION_URL);
    const data = await res.json();
    const latest = data.version.toString();

    if (!greaterThan(parseSemver(latest), parseSemver(VERSION))) return;

    console.log(
      `%c🎉 A new version of Flutter Fusion is available! (${VERSION} --> ${latest}) Update to get the best experience.`,
      "color: yellow",
    );

    if (!confirm("Do you want to upgrade?")) return;

    const { code } = await new Deno.Command("deno", { args: INSTALL_ARGS })
      .output();
    if (code === 0) {
      // The new binary is installed to disk, but this process is still running
      // the OLD code in memory. Exit now so the freshly installed version is
      // picked up when the user re-runs — otherwise the build below would run
      // with the outdated code.
      console.log(
        "%c🎉 Upgraded to latest version! Please re-run your command to use it.",
        "color: green",
      );
      Deno.exit(0);
    } else {
      console.log(
        "%cUpgrade failed. Please run the install command from the README manually.",
        "color: red",
      );
    }
  } catch {
    console.log("%cError checking for new version", "color: red");
  }
}
