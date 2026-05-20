# Vektor — React Native + Expo Migration Plan

## Overview

The current app is a React + Vite web app. This document covers converting it to React Native using Expo so it can ship on the Apple App Store and Google Play Store from a single codebase.

---

## Prerequisites

### Accounts & Tools
- [ ] Apple Developer Account ($99/year) — required for App Store submission
- [ ] Google Play Developer Account ($25 one-time) — optional, for Android
- [ ] Expo account — free at expo.dev
- [ ] Node.js >= 20 installed
- [ ] Your Mac — needed for final iOS signing and App Store submission

### Install on your Linux machine
```bash
npm install -g expo-cli eas-cli
```

---

## Phase 1 — New Expo Project Setup

### 1.1 Create the Expo app
```bash
npx create-expo-app@latest VektorApp --template blank-typescript
cd VektorApp
```

> Keep the existing FlexAppeal repo alive on its own branch. The React Native app is a new repo or a `/mobile` subfolder — do not convert the existing web app in place.

### 1.2 GitHub setup
Same as any project — `git init`, create repo on GitHub, push. The React Native project is plain code; nothing changes about your Git workflow.

### 1.3 EAS Build setup (replaces needing a Mac for builds)
```bash
eas login
eas build:configure
```
This creates `eas.json`. EAS Build compiles your iOS `.ipa` on Anthropic's cloud Mac servers — you push code from Linux, the build happens remotely.

---

## Phase 2 — Core Dependencies

Install the React Native equivalents of what the web app uses:

```bash
# Navigation (replaces react-router-dom)
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context

# Supabase (same package, works in RN)
npx expo install @supabase/supabase-js
npx expo install expo-secure-store  # replaces localStorage

# Async storage (replaces localStorage for non-sensitive data)
npx expo install @react-native-async-storage/async-storage

# Charts (replaces recharts)
npx expo install react-native-gifted-charts
# or: victory-native

# Icons (replaces lucide-react)
npx expo install @expo/vector-icons
# lucide-react-native also exists if you want to keep the same icon names

# Animations (replaces framer-motion)
npx expo install react-native-reanimated react-native-gesture-handler

# Apple Health
npx expo install react-native-health

# Camera / barcode (replaces @zxing)
npx expo install expo-camera expo-barcode-scanner

# Push notifications
npx expo install expo-notifications

# Drag and drop (replaces @dnd-kit)
npx expo install react-native-draggable-flatlist
```

---

## Phase 3 — What Translates Directly

These pieces of the current app can be moved over with minimal changes:

| Current | React Native equivalent | Effort |
|---|---|---|
| Supabase client + queries | Same `@supabase/supabase-js` | Low |
| React Query hooks | Same `@tanstack/react-query` | Low |
| AuthContext, TenantContext | Same pattern, just swap `localStorage` for `expo-secure-store` | Low |
| ML logic (`/ml/*.js`) | Pure JS — copy as-is | None |
| Business logic in hooks | Pure JS — copy as-is | Low |
| Zod validation | Same package | None |

---

## Phase 4 — What Needs to Be Rewritten

React Native does not use HTML. Every UI component must be rewritten:

| Web concept | React Native equivalent |
|---|---|
| `<div>` | `<View>` |
| `<p>`, `<span>` | `<Text>` |
| `<input>` | `<TextInput>` |
| `<button>` | `<TouchableOpacity>` or `<Pressable>` |
| `<img>` | `<Image>` |
| `<ScrollView>` | `<ScrollView>` or `<FlatList>` |
| CSS / Tailwind | `StyleSheet.create()` or NativeWind |
| `react-router-dom` | React Navigation |
| `localStorage` | `AsyncStorage` / `expo-secure-store` |
| `framer-motion` | `react-native-reanimated` |
| `recharts` | `react-native-gifted-charts` or `victory-native` |
| `leaflet` maps | `react-native-maps` |
| `@zxing` barcode | `expo-barcode-scanner` |

### Styling note
**NativeWind** brings Tailwind syntax to React Native. Given the current app uses Tailwind heavily, this is strongly recommended — it will make the rewrite feel more familiar.
```bash
npx expo install nativewind tailwindcss
```

---

## Phase 5 — Page-by-Page Migration Order

Recommended order (simplest to most complex):

1. **Login / Signup / ForgotPassword / ResetPassword** — auth flows, minimal state
2. **Onboarding** — linear flow, translates well to RN stack navigation
3. **Dashboard** — high visibility, sets the visual tone
4. **Workouts / WorkoutDetail** — core feature
5. **QuickWorkout / CreateWorkout** — active workout session (most complex UX)
6. **Schedule** — calendar UI, may need a RN calendar library
7. **ProgramBuilder / ProgramDetail** — complex but mostly forms + lists
8. **FoodTracker** — consider connecting to Apple Health instead of rebuilding
9. **Social / SocialFriends / PublicProfile** — social features
10. **Profile / Admin** — last, least critical path

---

## Phase 6 — Apple Health Integration

This is a key feature and requires a native module:

```bash
npx expo install react-native-health
```

Capabilities:
- Read steps, active calories, workouts from HealthKit
- Write workouts back to HealthKit after logging
- Read body weight for progress tracking

Requires adding permissions to `Info.plist` (Expo handles this via `app.json`):
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSHealthShareUsageDescription": "Vektor reads your health data to track workouts and progress.",
        "NSHealthUpdateUsageDescription": "Vektor writes workout data to Apple Health."
      }
    }
  }
}
```

Note: `react-native-health` requires a **development build** (not Expo Go) to test. Use `eas build --profile development` to generate a dev client.

---

## Phase 7 — Building & Submitting

### Development builds (for testing on device)
```bash
eas build --platform ios --profile development
```
Install the resulting `.ipa` via TestFlight or direct device install.

### Production build
```bash
eas build --platform ios --profile production
```

### Submit to App Store
```bash
eas submit --platform ios
```
EAS handles upload to App Store Connect. You'll need your Apple Developer credentials and to configure the app in App Store Connect first (app name, bundle ID, screenshots, description).

### Android (same codebase)
```bash
eas build --platform android --profile production
eas submit --platform android
```

---

## Phase 8 — App Store Requirements

Before submitting:
- [ ] App icon (1024x1024 PNG, no transparency)
- [ ] Screenshots for iPhone 6.5" and 5.5" displays
- [ ] App Store description (avoid clinical health claims)
- [ ] Privacy policy URL (required for health apps)
- [ ] Bundle ID registered in Apple Developer portal
- [ ] App Store Connect app record created

### Health app review notes
Apple scrutinizes health apps. Avoid:
- Claiming the app diagnoses, treats, or prevents conditions
- Storing health data without a clear privacy policy
- Requesting health permissions you don't use

---

## Folder Structure (Recommended)

```
VektorApp/
  app/                    # Expo Router screens (or use /src/screens)
  src/
    components/           # Reusable UI components
    screens/              # Full page screens
    hooks/                # Reused from web app (mostly unchanged)
    ml/                   # Copied directly from web app
    contexts/             # AuthContext, etc. (adapted for RN)
    lib/                  # Supabase client, utils
  assets/                 # Images, fonts
  app.json                # Expo config
  eas.json                # EAS Build config
  tailwind.config.js      # If using NativeWind
```

---

## Rough Timeline

| Phase | Estimated effort |
|---|---|
| Setup + dependencies | 1-2 days |
| Auth screens | 2-3 days |
| Dashboard + core navigation | 3-5 days |
| Workout logging (core loop) | 1-2 weeks |
| Remaining screens | 2-3 weeks |
| Apple Health integration | 3-5 days |
| Polish + TestFlight beta | 1 week |
| App Store submission + review | 1-7 days (Apple review) |

Total realistic estimate: **6-10 weeks** for a solid v1, working part-time.

---

## Key Decisions to Make Before Starting

1. **NativeWind vs plain StyleSheet** — NativeWind is strongly recommended given existing Tailwind usage
2. **Expo Router vs React Navigation** — Expo Router is file-based (like Next.js); React Navigation is more explicit. Either works.
3. **Keep web app alive in parallel?** — Recommended yes, at least until the native app is stable
4. **FoodTracker scope** — Rebuild it, cut it, or defer to Apple Health integration?
