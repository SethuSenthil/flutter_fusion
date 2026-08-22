// pubspec.yaml version/build-number bumping.

import { parse as parseYaml } from "jsr:@std/yaml@1.2.0";
import type { Context } from "./config.ts";

/**
 * Apply version changes to pubspec.yaml based on config, mutating
 * `ctx.pubspec` so later stages (iOS build, git commit) see the new value.
 *
 * - `increment_version`: 1.0.0+3 -> 1.0.1+0
 * - `auto_increment_build`: 1.0.0+1 -> 1.0.0+2
 */
export async function applyVersioning(ctx: Context): Promise<void> {
  const { config, pubspecPath } = ctx;
  let pubspecData = await Deno.readTextFile(pubspecPath);
  const currentEntry = "version: " + ctx.pubspec.version;

  if (config.increment_version) {
    const versionNumber = ctx.pubspec.version.toString().split("+")[0];
    const [major, minor, patch] = versionNumber.split(".");
    const newVersion = `${major}.${minor}.${parseInt(patch) + 1}`;

    pubspecData = pubspecData.replace(currentEntry, `version: ${newVersion}+0`);
    await Deno.writeTextFile(pubspecPath, pubspecData);
    ctx.pubspec = parseYaml(pubspecData);

    console.log(
      `📝 Incremented version from ${versionNumber} to ${newVersion} in pubspec.yaml`,
    );
    return;
  }

  if (config.auto_increment_build) {
    const buildNumber = parseInt(ctx.pubspec.version.toString().split("+")[1]);
    const newBuildNumber = buildNumber + 1;

    pubspecData = pubspecData.replace(
      currentEntry,
      `version: ${ctx.pubspec.version.split("+")[0]}+${newBuildNumber}`,
    );
    await Deno.writeTextFile(pubspecPath, pubspecData);
    ctx.pubspec = parseYaml(pubspecData);

    console.log(
      `📝 Incremented build number from ${buildNumber} to ${newBuildNumber} in pubspec.yaml`,
    );
  }
}
