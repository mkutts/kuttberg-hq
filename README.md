# Kuttberg HQ

Kuttberg HQ is a private household command center for two people. The app targets iOS and Android and uses Expo SDK 58, React Native, Expo Router, and strict TypeScript. It uses npm and is intended for source control on GitHub.

## Get started

Install Git, npm, and Node.js 22.13 or newer on the Node 22 release line, or a newer supported LTS release such as Node 24.3 or later. Open a terminal in the project folder and run:

```sh
npm ci
npm start
```

To open the app on a physical phone, install an Expo Go release that supports SDK 58, connect the phone and computer to the same Wi-Fi network, and scan the QR code. On iOS, use Camera. On Android, use Expo Go. Check current SDK compatibility at [Expo Go downloads](https://expo.dev/go).

## Run on iOS or Android

| Platform | Setup | Command |
| --- | --- | --- |
| iOS Simulator | On a Mac, install a compatible Xcode and an iOS Simulator runtime. Open the simulator. | `npm run ios` |
| Android Emulator | Install Android Studio and the Android SDK, configure Android SDK platform tools, then start an emulator in Device Manager. | `npm run android` |

If compatible Expo Go is unavailable for your target, use `npx expo run:ios` on a Mac with Xcode or `npx expo run:android` with the Android SDK and JDK configured. These commands build and install the app locally. See [Expo's local build setup](https://docs.expo.dev/guides/local-app-development/).

On both platforms, confirm the app opens to **Kuttberg HQ** and displays “Your household command center is taking shape.”

## Development checks

```sh
npm run lint
npm run typecheck
npm test
npx expo install --check
npx expo-doctor
```

The rendering test checks the welcome screen with Jest and React Native Testing Library. Task 01 verified the welcome screen in Expo Go on an Android 16 emulator and exported bundles for both platforms. An iOS launch still needs an iPhone or a Mac with Xcode and the iOS Simulator. The Task 01 environment runs Windows.

## Milestone 01, Task 01 of 8

The current scope is repository inspection and the app foundation. The app has one welcome screen. The design system, five-tab navigation, Today dashboard, reusable UI library, authentication, Supabase, analytics, and household data are outside Task 01.

Both platforms use the temporary development identifier `com.example.kuttberghq`. Confirm and replace it before a production release. Expo generates the native project directories locally when needed.
