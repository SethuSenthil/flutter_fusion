import { move } from "https://deno.land/std/fs/mod.ts";

const downloadsFolder = `${Deno.env.get("HOME")}/Downloads`;
const privateKeysFolder = `${Deno.env.get("HOME")}/private_keys`;

// Create the folder if it doesn't exist
await Deno.mkdir(privateKeysFolder, { recursive: true });

// Get all files in the downloads folder
const files = await Deno.readDir(downloadsFolder);

// Filter out all files that don't end with .p8
const p8Files = [];
for await (const file of files) {
  if (file.isFile && file.name.endsWith(".p8")) {
    p8Files.push(file);
  }
}

// // Sort the files by creation time (newest first)
// p8Files.sort((a, b) => {
//     const aTime = a.getTime() ?? 0;
//     const bTime = b.mtime?.getTime() ?? 0;
//     return bTime - aTime;
// });

// Get the newest file
const newestFile = p8Files[0];

// Move the newest file to the private_keys folder
await move(
  `${downloadsFolder}/${newestFile.name}`,
  `${privateKeysFolder}/${newestFile.name}`
);

function extractIdFromAuthKey(authKey: string): string | null {
  const startIndex = authKey.indexOf("_") + 1;
  const endIndex = authKey.indexOf(".p8");

  if (startIndex === 0 || endIndex === -1) {
    return null; // ID not found
  }

  return authKey.substring(startIndex, endIndex);
}

const keyID: string = extractIdFromAuthKey(newestFile.name.split(".")[0]);

//create a pubspec.yaml file in the private_keys folder
const pubspecFile = `${privateKeysFolder}/pubspec.yaml`;
await Deno.writeTextFile(
  pubspecFile,
  `
flutter_fusion:
  APP_STORE_CONNECT_API_KEY_ID: "${keyID}"
  API_KEY_ISSUER: "YOUR API KEY ISSUER FROM APP STORE CONNECT"
`
);
