//deno run --allow-read --allow-env --allow-run --allow-write --allow-sys --allow-net main.ts

//main file where everything actually happens (TODO: need to split this up into multiple files)

import * as path from "https://deno.land/std@0.177.0/path/mod.ts";
import Spinner from "https://deno.land/x/cli_spinners@v0.0.2/mod.ts";
import * as mod from "https://deno.land/std@0.192.0/flags/mod.ts";
import { parse } from "npm:yaml@2.3.1";
import { exists } from "https://deno.land/std@0.192.0/fs/mod.ts";
import * as semver from "https://deno.land/std@0.192.0/semver/mod.ts";

const _VERSION = "0.0.1";

const startTime: Date = new Date();

//check for new version
try {
  const latestVersionData = await fetch(
    "https://flutter-fusion.sethusenthil.com/version.json"
  );

  const latestVersionJson = await latestVersionData.json();

  const latestVersion: string = (latestVersionJson.version =
    latestVersionJson.version.toString());

  const versionCompare = semver.compare(latestVersion, _VERSION);

  if (versionCompare === 1) {
    console.log(
      `%c🎉 A new version of Flutter Fusion is available! (${_VERSION} --> ${latestVersion}) Please update to the latest version to get the best experience.`,
      "color: yellow"
    );

    const shouldUpgrade = confirm("Do you want to upgrade?");

    if (shouldUpgrade) {
      const upgrade = new Deno.Command("deno", {
        args: [
          "install",
          "-n",
          `flutter-fusion`,
          "--allow-read",
          `--allow-env"`,
          "--allow-run",
          "--allow-write",
          "--allow-sys",
          "--allow-net",
          "https://flutter-fusion.sethusenthil.com/main.ts",
        ],
      });
      const { code, stdout, stderr } = await upgrade.output();
      if (code === 0) {
        console.log("🎉 Upgraded to latest version!");
      }
    }
  }
} catch (e) {
  console.log("%cError checking for new version", "color: red");
  //console.log(e);
}

//VALIDATION AND CONFIG DECLARATION LOGIC

// Getting the current working directory path
const __dirname: string = Deno.cwd();

const pubspecPath: string = path.join(__dirname, "pubspec.yaml");

if (!(await exists(pubspecPath))) {
  throw new Error(
    "pubspec.yaml not found! Please make sure you are running this command in the root directory of your Flutter project."
  );
}

let pubspecData: string = await Deno.readTextFile(pubspecPath);

let pubspec = parse(pubspecData);

//console.log(pubspec);

const privateKeysPath: string = path.join(
  Deno.env.get("HOME")!,
  "/private_keys"
);

const globalPubspecPath: string = path.join(privateKeysPath, "pubspec.yaml");

if (!(await exists(globalPubspecPath))) {
  console.log(
    "%It is recommend to create a global pubspec.yaml file in your home directory inside private_keys.",
    "color: yellow"
  );
}

const globalPubspecPathData: string = await Deno.readTextFile(
  globalPubspecPath
);

const globalPubSpec = parse(globalPubspecPathData);

//console.log(globalPubSpec);

const getTimeDifference = (startTime: Date, endTime: Date): string => {
  const timeDiff: number = endTime.getTime() - startTime.getTime();
  const secondsDiff: number = Math.floor(timeDiff / 1000) % 60;
  const minutesDiff: number = Math.floor(timeDiff / (1000 * 60));
  const formattedTime = `${minutesDiff} minutes and ${secondsDiff} seconds`;
  return formattedTime;
};

const args = mod.parse(Deno.args);

console.log(args);

const config = {
  verbose:
    pubspec.flutter_fusion.verbose ??
    globalPubSpec.flutter_fusion.verbose ??
    false,
  build_flags: pubspec.flutter_fusion.build_flags ?? [], //global defaults disabled
  APP_STORE_CONNECT_API_KEY_ID:
    pubspec.flutter_fusion.APP_STORE_CONNECT_API_KEY_ID ??
    globalPubSpec.flutter_fusion.APP_STORE_CONNECT_API_KEY_ID,
  API_KEY_ISSUER:
    pubspec.flutter_fusion.API_KEY_ISSUER ??
    globalPubSpec.flutter_fusion.API_KEY_ISSUER,
  ios: pubspec.flutter_fusion.ios ?? false,
  android: pubspec.flutter_fusion.android ?? false,
  web: pubspec.flutter_fusion.web ?? false,
  auto_increment_build:
    args["increment-build"] ??
    pubspec.flutter_fusion.auto_increment_build ??
    globalPubSpec.flutter_fusion.auto_increment_build ??
    false,
  increment_version: args["increment-version"] ?? false,
  git: args.git ?? pubspec.flutter_fusion.git ?? false,
};

if (config.verbose) {
  console.log("🔬 Verbose mode enabled");
}

const commitMessagePath: string = path.join(__dirname, "COMMIT_EDITMSG");

if (config.git) {
  // console.log("📝 Git enabled");
  if (!(await exists(path.join(__dirname, ".git"), { isDirectory: true }))) {
    throw new Error(
      "Git repository not found! Please make sure you are running this command in the root directory of your Flutter project. Or disable git in pubspec.yaml or the --git=false flag."
    );
  } else {
    //check for COMMIT_EDITMSG file
    if (
      !(await exists(commitMessagePath, { isFile: true, isReadable: true }))
    ) {
      //create file
      await Deno.writeTextFile(commitMessagePath, "COMMIT DESCRIPTION HERE");

      //warn
      console.log(
        "%c⚠️ Git commit message not found. Created a default one. You can edit still it at COMMIT_EDITMSG while the app is building. 🥂",
        "color: yellow"
      );
    } else {
      let commitMessage: string = await Deno.readTextFile(commitMessagePath);
      commitMessage = commitMessage.trim();

      if (commitMessage === "COMMIT DESCRIPTION HERE" || commitMessage === "") {
        console.log(
          "%c⚠️ Default commit message found. You can edit still it at COMMIT_EDITMSG while the app is building. 🥂",
          "color: yellow"
        );
      }
    }
  }
}

//AUTO VERSION INCREMENT LOGIC

const currentBuildYamlEntry: string = "version: " + pubspec.version;

if (config.increment_version) {
  const versionNumber: string = pubspec.version.toString().split("+")[0];
  const versionNumberArray: string[] = versionNumber.split(".");
  const newVersionNumber: string =
    versionNumberArray[0] +
    "." +
    versionNumberArray[1] +
    "." +
    (parseInt(versionNumberArray[2]) + 1);

  pubspecData = pubspecData.replace(
    currentBuildYamlEntry,
    "version: " + newVersionNumber
  );

  await Deno.writeTextFile(pubspecPath, pubspecData);

  pubspec = parse(pubspecData);

  console.log(
    "📝 Incremented build number from " +
      versionNumber +
      " to " +
      newVersionNumber +
      " in pubspec.yaml"
  );
}

if (config.auto_increment_build && !config.increment_version) {
  const buildNumber: number = parseInt(
    pubspec.version.toString().split("+")[1]
  );
  const newBuildNumber: number = buildNumber + 1;

  pubspecData = pubspecData.replace(
    currentBuildYamlEntry,
    "version: " + pubspec.version.split("+")[0] + "+" + newBuildNumber
  );
  await Deno.writeTextFile(pubspecPath, pubspecData);

  pubspec = parse(pubspecData);

  console.log(
    "📝 Incremented build number from " +
      buildNumber +
      " to " +
      newBuildNumber +
      " in pubspec.yaml"
  );
}

const successStyle = "color: green";

//IOS BUILD LOGIC

if (config.ios) {
  //IOS VALIDATION LOGIC
  console.log("%c Starting iOS Build Process...", "color: blue");

  if (config.APP_STORE_CONNECT_API_KEY_ID == undefined) {
    throw new Error(
      "APP_STORE_CONNECT_API_KEY_ID is required and is not set! Please set it in your pubspec.yaml or .env file. You can get it from App Store Connect > Users and Access > Keys."
    );
  }

  if (config.API_KEY_ISSUER == undefined) {
    throw new Error(
      "API_KEY_ISSUER is required and is not set! Please set it in your pubspec.yaml or .env file. You can get it from App Store Connect > Users and Access > Keys."
    );
  }

  if (!exists(privateKeysPath)) {
    throw new Error(
      "Private keys folder not found! Please make sure you have placed the AuthKey file in the private_keys folder in your home directory. You can get it from App Store Connect > Users and Access > Keys."
    );
  }

  const authKeyPath: string = path.join(
    privateKeysPath,
    "AuthKey_" + config.APP_STORE_CONNECT_API_KEY_ID + ".p8"
  );

  if (!exists(authKeyPath)) {
    throw new Error(
      "AuthKey file not found! Please make sure you have placed the AuthKey file in the private_keys folder in your home directory. You can get it from App Store Connect > Users and Access > Keys."
    );
  }

  // Logging the start of the build process
  const buildSpinner = Spinner.getInstance();
  buildSpinner.start("⚒️ Flutter App Build for  iOS Started...");

  // Building the flutter app binary
  const buildBinary = new Deno.Command("flutter", {
    args: ["build", "ipa"].concat(config.build_flags),
  });
  const { code, stdout, stderr } = await buildBinary.output();

  // stdout & stderr are a Uint8Array, decoding them to string and logging
  if (config.verbose) {
    console.log(new TextDecoder().decode(stdout));
    console.log(new TextDecoder().decode(stderr));
  }

  // Checking if the build was successful
  if (code === 0) {
    buildSpinner.setText("");
    buildSpinner.stop();

    console.log("%c✅ Flutter App Binary Built Successfully", successStyle);

    // Getting the path of the built IPA file
    const ipaDirPath = path.join(__dirname, "build/ios/ipa/");

    const ipaFileName: string = pubspec.name + ".ipa";

    const validationSpinner = Spinner.getInstance();
    validationSpinner.start("Binary Validation Started...");

    // Validating the built binary using xcrun altool
    const validateBinary = new Deno.Command("xcrun", {
      args: [
        "altool",
        "ipa",
        "--validate-app",
        `--type`,
        "ios",
        `-f`,
        path.join(ipaDirPath, ipaFileName),
        `--apiKey`,
        config.APP_STORE_CONNECT_API_KEY_ID,
        `--apiIssuer`,
        config.API_KEY_ISSUER,
      ],
    });
    const { code, stdout, stderr } = await validateBinary.output();

    if (config.verbose) {
      console.log(new TextDecoder().decode(stdout));
      console.log(new TextDecoder().decode(stderr));
    }

    // Uploading the binary to App Store Connect if validation was successful
    if (code === 0) {
      validationSpinner.setText("");
      validationSpinner.stop();

      console.log("%c✅ App Validation Successful", successStyle);

      const uploadSpinner = Spinner.getInstance();
      uploadSpinner.setSpinnerType("weather");
      uploadSpinner.start("Upload to  App Store Connect Started...");

      const uploadBinary = new Deno.Command("xcrun", {
        args: [
          "altool",
          "--upload-app",
          `--type`,
          "ios",
          `-f`,
          path.join(ipaDirPath, ipaFileName),
          `--apiKey`,
          config.APP_STORE_CONNECT_API_KEY_ID,
          `--apiIssuer`,
          config.API_KEY_ISSUER,
        ],
      });
      const { code, stdout, stderr } = await uploadBinary.output();

      if (config.verbose) {
        console.log(new TextDecoder().decode(stdout));
        console.log(new TextDecoder().decode(stderr));
      }

      // Logging the success of the upload process
      if (code === 0) {
        uploadSpinner.setText("");
        uploadSpinner.stop();

        console.log(
          "%c✅ App Successfully Uploaded to  App Store Connect!",
          successStyle
        );

        const endTime: Date = new Date();

        const minutesDiff = getTimeDifference(startTime, endTime);

        const version = pubspec.version.split("+")[0];
        const build = pubspec.version.split("+")[1];

        console.log(
          `%c🕓 Finished  iOS binary version %c${version}%c build %c${build}%c in ${minutesDiff} minutes`,
          "",
          "color: blue",
          "",
          "color: blue",
          ""
        );
      }
    } else {
      // Throwing an error if binary validation failed
      throw new Error("App Binary Validation Failed");
    }
  } else {
    // Throwing an error if flutter was unable to build the app binary
    throw new Error("Flutter was unable to build the app binary");
  }
}

//ANDROID BUILD LOGIC

if (config.android) {
  console.log(
    "Android build is not supported yet. Please check back later.",
    "color: red"
  );
}

//WEB BUILD LOGIC

if (config.web) {
  console.log(
    "Web build is not supported yet. Please check back later.",
    "color: red"
  );
}

//GIT COMMIT LOGIC

if (config.git) {
  console.log("%cGIT: Staging Changes...", "color: blue");

  const gitAdd = new Deno.Command("git", {
    args: ["add", "--all"],
  });
  const { code, stdout, stderr } = await gitAdd.output();

  if (config.verbose) {
    console.log(new TextDecoder().decode(stdout));
    console.log(new TextDecoder().decode(stderr));
  }

  if (code === 0) {
    const commitMessage = await Deno.readTextFile(commitMessagePath);

    console.log("%cGIT: Committing Changes...", "color: blue");

    const gitCommit = new Deno.Command("git", {
      args: [
        "commit",
        "-m",
        `"${config.increment_version}"`,
        "-m",
        `"${commitMessage}"`,
      ],
    });
    const { code, stdout, stderr } = await gitCommit.output();

    if (config.verbose) {
      console.log(new TextDecoder().decode(stdout));
      console.log(new TextDecoder().decode(stderr));
    }

    if (code === 0) {
      console.log("%cGIT: Pushing Changes to Remote...", "color: blue");

      const gitPush = new Deno.Command("git", {
        args: ["push", "origin", "main"], //check if main or master is used as default
      });
      const { code, stdout, stderr } = await gitPush.output();

      if (config.verbose) {
        console.log(new TextDecoder().decode(stdout));
        console.log(new TextDecoder().decode(stderr));
      }

      if (code === 0) {
        console.log("%c✅ Pushed the changes to the git remote", successStyle);
      }
    }
  }
}
//https://keith.github.io/xcode-man-pages/altool.1.html
