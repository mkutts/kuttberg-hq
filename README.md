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

On both platforms, confirm the app opens to **Kuttberg HQ** and shows **Design System Preview**. Scroll to the five labeled swatches, activate and reset the demo, and confirm the disabled button does not respond. Repeat with larger system text and system dark mode. Check for readable text, safe-area spacing, and dark status bar icons against the light theme. With VoiceOver or TalkBack, check that headings, buttons, and the disabled state are announced.

## Development checks

```sh
npm run lint
npm run typecheck
npm test
npx expo install --check
npx expo export --platform all
npx expo-doctor
```

Jest and React Native Testing Library cover the preview, its demo controls, and the shared components. Task 01 was verified on an iPhone and an Android phone. Task 02 requires a separate visual and accessibility pass on both platforms.

## Milestone 01, Task 02 of 8

The app opens to a temporary design-system preview. Shared colors, typography, spacing, and radii live in `src/theme`. `AppText`, `AppButton`, `AppCard`, `AppScreen`, and `SectionHeader` live in `src/components/ui`. The preview uses a light theme, system fonts, and React Native text scaling. Five-tab navigation and the Today dashboard are scheduled for later tasks.

Both platforms use the temporary development identifier `com.example.kuttberghq`. Confirm and replace it before a production release. Expo generates the native project directories locally when needed.
