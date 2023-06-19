// deno run --allow-read --allow-write build.ts

// script to build and host the CLI
import * as path from "https://deno.land/std@0.177.0/path/mod.ts";

const __dirname = new URL(".", import.meta.url).pathname;

const pathToMain = path.join(__dirname, "main.ts");
const buildFolder = path.join(__dirname, "docs");
const pathToBuildMain = path.join(buildFolder, "main.ts");

await Deno.copyFile(pathToMain, pathToBuildMain);

//read main.ts
const mainFile = await Deno.readTextFile(pathToMain);
const version = mainFile.split('const _VERSION = "')[1].split('"')[0];
console.log("version", version);

const versionData = {
  version: version,
  changelog: "some changesy",
};

//write version.json
const versionFile = path.join(buildFolder, "version.json");
await Deno.writeTextFile(versionFile, JSON.stringify(versionData));
