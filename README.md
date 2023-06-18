# Flutter Fusion
### The ultimate Flutter build tool

👷 This is still a work in progress, I have yet to build a compiled version. Use at your own risk atm.

## Idea
Idk about y'all but I'm tired of manually uploading my builds to App Store Connect and the Play Store. It would be amazing if there is something simple that lets me compile the app on my own computer, manage the versioning, and automatically compile and upload my Flutter app to where ever it needs to be and push to version control. This is where Flutter Fusion comes in!

## Usage
Instead of running flutter build simply run this instead in the root of your flutter project

```shell
flutter-fusion
```
optional flags:
- -git=true|false : This override the default setting in your pubspec to enable or disable committing and pushing to git
- -auto_increment_build=true|false : This override the default setting in your pubspec to automatically increment your build number (ex: from 1.0.0+1 --> 1.0.0+2)
- -auto_increment_version=true|false : Increment a whole minor version (ex: from 1.0.0+3 --> 1.0.1+0)

This command alone will automatically build your iOS (Android & Web coming soon) app a proper versioning increment, validate the archives, upload the archives, then auto commit your changes to source control.

## Setup
### iOS and MacOS
- Have Xcode fully installed
- Get your App Store Connect API Key
  - Make a new folder in your Home directory
  - Place the file ending in '.p8' in it
  - Create a new file called pubspec.yaml (sound familiar 😉)
  - This is where your global settings for Flutter Fusion will be written
  - Paste the following
 ```yaml
  flutter_fusion:
  APP_STORE_CONNECT_API_KEY_ID: "YOUR_API_KEY_ID_HERE" #should be similar to your .p8 file name
  API_KEY_ISSUER: "YOUR_API_KEY_ISSUER_FROM_APPSTORE_CONNECT"
  ```

### General Setup
This is the same for all flutter targets

- In your projects pubspec, simply add the following entry and customize it to your liking. All options can be omitted and it will take its default value, or the value passed in as a flag when running the command.

```yaml
flutter_fusion:
  verbose: false #print all outputs
  #build_flags: ["--no-tree-shake-icons"] #you can pass in additional flags for `flutter build`
  ios: true #enable build and upload for iOS
  android: false #enable build and upload for Android
  web: false #enable build and upload for Web
  auto_increment_build: false #would recommend setting to TRUE. This will automatically increment your build number (can be overridden temporarily using CLI flag)
  git: false #would recommend setting this to TRUE if you use a git repo. This will automatically commit your code with the provided message and push to remote
```

#### More info on Git
Flutter Fusion will create a file called 'COMMIT_EDITMSG' on first run. In this file you can enter your commit description. It is reset after every build is uploaded correctly. The title of your commit will always be your entire build version.