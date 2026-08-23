// Single source of truth for the CLI version.
// build.ts reads this to generate docs/version.json, and update.ts compares
// against it to decide whether a newer release is available.
export const VERSION = "0.0.4";
