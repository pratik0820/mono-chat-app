# FEATURE 2 — Firebase Setup for Push Notifications (Android APK)

> **Who this is for:** you, doing the one-time Firebase configuration that lets your **GitHub-pipeline-built APK** receive push notifications via FCM.
> **Already done in the app (no action needed):** package id changed to `com.monochat.app`, `app.json` wired with `googleServicesFile`, `.gitignore` updated, CI inject step added to `.github/workflows/build-apk.yml`.
> **What you must produce:** a `google-services.json` file (given to me to place in the repo locally) + a service-account JSON uploaded to Expo + one GitHub secret.
> **Time:** ~15–20 minutes. **Cost:** free.

---

## Part A — Download `google-services.json` from Firebase

### Step 1 — Create the Firebase project (skip if you have one)

1. Go to **https://console.firebase.google.com/** and sign in with any Google account.
2. Click **"Create a project"** (or "Add project").
3. Project name: e.g. `mono-chat` → **Continue**.
4. Google Analytics: **Disable** (not needed for push) → **Create project**.
5. Wait for "Your new project is ready" → **Continue**.

### Step 2 — Register the Android app (this is where the package id matters)

1. On the Firebase project overview page, click the **Android icon** (.robot) — "Add app to get started".
2. **Android package name** — type exactly:
   ```
   com.monochat.app
   ```
   ⚠️ This must match `mobile/app.json` → `android.package` **character-for-character**. I already set it to `com.monochat.app`, so use exactly that. If you prefer a different id, tell me and I'll change `app.json` instead — but they must match.
3. **App nickname (optional):** `Mono Android`.
4. **Debug signing certificate SHA-1 (optional):** leave **empty** — not required for FCM push.
5. Click **"Register app"**.

### Step 3 — Download the config file

1. After registering, Firebase offers **"Download google-services.json"** — click it.
   (If you skipped past it: Project settings (gear icon, top left) → **General** tab → "Your apps" card → under the Android app → click the **google-services.json** download button.)
2. You get a file named **`google-services.json`** — it looks like this:
   ```json
   {
     "project_info": {
       "project_number": "123456789012",
       "project_id": "mono-chat",
       "storage_bucket": "mono-chat.appspot.com"
     },
     "client": [
       {
         "client_info": { "android_client_info": { "package_name": "com.monochat.app" } },
         "oauth_client": [],
         "api_key": [ { "current_key": "AIza..." } ],
         "services": { "appinvite_service": { "other_platform_oauth_client": [] } }
       }
     ],
     "configuration_version": "1"
   }
   ```
3. **Sanity-check before sending:** `"package_name"` must read `com.monochat.app`. If it doesn't, you registered the app with the wrong id — fix it in Project settings → General → your Android app → package name (or register a new Android app with the right one) and re-download.

### Step 4 — Give the file to me

Paste the **full contents of `google-services.json`** into the chat (it contains no secret — it's a public identifier config, safe to share; this is the same file that ships inside every APK).

I will then:
- place it at **`mobile/google-services.json`** (the path `app.json` → `android.googleServicesFile` already points to),
- confirm prebuild picks it up,
- and it stays out of git (already gitignored) while CI receives it via secret (Part C).

> **Skip Part A?** No — everything else depends on this file existing.

---

## Part B — Upload the service-account key to Expo (the step people miss)

Expo's push service fans out to FCM **on your behalf**, so it must authenticate to *your* Firebase project. Google removed the old "server key" auth; FCM v1 requires a **service account**. You upload it **once** to Expo — your backend never touches it.

### Step 1 — Generate the service account key

1. In the Firebase console, click the **gear icon** (top left) → **Project settings**.
2. Open the **Service accounts** tab.
3. You'll see: *"Firebase requires a service account to grant admin access…"* and a button **"Generate new private key"** → click it.
4. A dialog explains the key grants admin access → click **"Generate key"**.
5. A `.json` file downloads (name like `mono-chat-firebase-adminsdk-xxxxx.json`). Keep it safe — **anyone with this file can send push to your users and read/write your Firebase project.** Never commit it, never paste it in chat.

### Step 2 — Upload the key to Expo

**Option 1 — web dashboard (easiest):**
1. Go to **https://expo.dev/** and log in (create a free account if needed — same account you'd use for EAS).
2. Open your project (or create one and link it — select the org/project matching `projectId` `1cde9104-63f3-4b78-958f-6d4a6e4ba967` from `app.json` → `extra.eas`).
3. Go to **Credentials** (left sidebar).
4. Under **Android**, find the **FCM / Push credentials** section → click **"Add" / "Upload key"** (labeled "Firebase Cloud Messaging token / service account key" depending on UI version; pick the **V1 service account key** option if both are shown).
5. Upload the JSON you generated in Step 1 → Save.

**Option 2 — CLI:**
```bash
cd mobile
npx eas credentials
```
→ choose your project → **Android** → **Push notifications: Manage** → **Set FCM v1 service account key** → follow the prompt to upload the JSON file.

✅ **Done when:** Expo's credentials page shows a valid FCM v1 key for Android. Nothing further — Expo uses it every time your backend calls the push API.

---

## Part C — Add the GitHub secret (so CI can build push-capable APKs)

Your pipeline builds on GitHub's servers, where `mobile/google-services.json` doesn't exist (gitignored). The workflow I added injects it from a repo secret named **`GOOGLE_SERVICES_JSON`**.

### Step 1 — Base64-encode the file

Run this **after I place the file** (or wherever you keep it):

```bash
base64 -w0 google-services.json > google-services.base64
```

- Linux/Git Bash: `base64 -w0 google-services.json`
- macOS: `base64 -i google-services.json -o google-services.base64`
- PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json")) | Set-Content google-services.base64`

### Step 2 — Create the secret

1. Open your repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click **"New repository secret"**.
3. **Name:** `GOOGLE_SERVICES_JSON` (exactly — the workflow reads this name).
4. **Secret:** paste the **entire base64 string** (one long line).
5. **Add secret**.

### How the pipeline uses it (already wired — for reference)

```yaml
- name: Inject Firebase config (google-services.json)
  working-directory: mobile
  env:
    GOOGLE_SERVICES_JSON: ${{ secrets.GOOGLE_SERVICES_JSON }}
  run: |
    if [ -n "$GOOGLE_SERVICES_JSON" ]; then
      echo "$GOOGLE_SERVICES_JSON" > google-services.json
    else
      echo "::warning::Secret GOOGLE_SERVICES_JSON is not set - push notifications will NOT work in this APK."
    fi
```

It runs right after the `.env.local` step and **before** `expo prebuild` — which is the order that matters, because prebuild is what copies the file into `android/app/google-services.json` and wires the Google Services Gradle plugin into the build (Expo does this automatically when `android.googleServicesFile` is set in `app.json`).

If the secret is missing the build **still succeeds** (with a loud warning) — chat keeps working; only push is dead.

---

## Part D — What I already changed in the app (no action needed)

| File | Change | Why |
|---|---|---|
| `mobile/app.json` | `android.package`: `com.anonymous.mono` → **`com.monochat.app`**; added `"googleServicesFile": "./google-services.json"` | FCM binds to the package id; the file path makes prebuild wire Firebase automatically |
| `mobile/.gitignore` | added `google-services.json` | Per-environment config stays out of git (CI gets it via secret) |
| `.github/workflows/build-apk.yml` | new "Inject Firebase config" step | Copies the secret's contents to `mobile/google-services.json` before prebuild |

⚠️ **Install note:** changing the package id means the new APK is a **different app** — it won't update over an installed old APK. Uninstall the old one first (users log in again).

---

## Part E — Verification checklist

1. **CI build:** run the pipeline → the log shows `google-services.json injected from secret` (not the warning).
2. **Install & open** the APK on a physical Android device → log in.
3. **First login triggers the OS permission dialog:** "Allow Mono to send you notifications?" → **Allow**.
   (If previously denied: Settings → Apps → Mono → Notifications → enable, then reopen the app.)
4. **Token registered:** check the backend `push_tokens` table:
   ```sql
   SELECT user_id, platform, right(token, 10) AS token_tail, device_name, last_used_at
   FROM push_tokens ORDER BY last_used_at DESC;
   ```
   A row with `platform = 'android'` must appear within a few seconds of login.
5. **End-to-end:** log the same user in on a second device (or force-quit the app), send a message from another user in a shared room → the first device shows the OS banner; tapping it opens the room.
6. **Expo tool test (optional):** grab the full token from `push_tokens` and send a test push from https://expo.dev/notifications.

### If pushes don't arrive

| Symptom | Cause | Fix |
|---|---|---|
| `getExpoPushTokenAsync` throws on app start / no row in `push_tokens` | Firebase config missing in the build | Check the CI log for the inject step; confirm the secret is set and base64 valid |
| Row exists, backend dispatches, no banner | Service-account key missing on Expo | Part B, Step 2 — upload it, no rebuild needed |
| Expo ticket error `DeviceNotRegistered` | Stale token (app reinstalled) | Expected — backend auto-deletes; device re-registers on next launch |
| Delayed/no delivery on Xiaomi/Realme/OPPO | OEM battery killer killed FCM sync | Test on a stock-Android device too; expected behavior on aggressive OEMs |
| Works on Wi-Fi, not mobile data (or vice versa) | Carrier/network blocking FCM port | Rare; try another network |

---

## Summary of what you do vs. what I did

**You (Parts A–C):**
1. Create Firebase project + register Android app with package `com.monochat.app`
2. Download `google-services.json` → **paste it to me**
3. Generate service-account key → upload to Expo credentials (dashboard or `eas credentials`)
4. Create GitHub secret `GOOGLE_SERVICES_JSON` (base64 of the file)

**Me (already done, awaiting your file):**
- `app.json` package id + `googleServicesFile` wiring ✅
- `.gitignore` ✅
- CI inject step ✅
- Place `google-services.json` at `mobile/google-services.json` ← pending your file
