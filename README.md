# GearLog

A installable, offline-capable PWA for tracking DIY vehicle maintenance — multiple vehicles, schedules, mileage, and a full log of everything you've done. No backend: everything is static files + your browser's storage.

## Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `gearlog`).
2. Copy every file in this folder into the repo root, preserving the folder structure (`css/`, `js/`, `icons/`, `index.html`, `manifest.json`, `service-worker.js`).
3. Commit and push.
4. In the repo: **Settings → Pages → Source → Deploy from a branch**, pick `main` (or your default branch) and `/ (root)`, save.
5. GitHub gives you a URL like `https://yourname.github.io/gearlog/`. Open it — that's the app.
6. On a phone, open that URL and use "Add to Home Screen" (iOS Safari) or the install prompt (Android Chrome) to install it like a native app. It works offline after the first load.

Because the manifest and service worker use relative paths, this works whether it's a project site (`/gearlog/`) or a user/organization root site.

## What's built in

- **Multiple vehicles**, each with its own schedule, mileage history, and maintenance log.
- **Starting maintenance schedule on vehicle add** — see the honest caveat below.
- **Editable everything**: change intervals, notes, categories, or delete any seeded task; add unlimited custom tasks.
- **Notes field on every task**, plain text, freeform (torque specs, part numbers, preferred fluid, whatever you want).
- **Mileage tracking** with a history log; "Mark done" on a task also nudges the vehicle's mileage forward if you enter something higher.
- **Reminders**: an in-app banner (dashboard + vehicle page) flags overdue/due-soon tasks and stale mileage. Settings lets you tune the "due soon" window and how many days count as stale.
- **VIN decode**: optional, uses NHTSA's free public vPIC database to auto-fill year/make/model/trim from a VIN.
- **Check for updates** button in Settings, plus automatic detection of a new service worker version with a prompt to reload.
- **Export/Import**: Settings → Export backup downloads a JSON file with everything; Import can merge into existing data or replace it entirely. Good for backups or moving to a new phone/browser.

## Two honest limitations worth knowing

**"Manufacturer recommended schedule" is really a generic industry-standard schedule.** There's no free, reliable public API that returns an exact factory maintenance schedule for an arbitrary VIN — manufacturers don't publish that as open data. So when you add a vehicle, GearLog seeds it from a solid set of generic interval templates (by vehicle type: gas/synthetic, truck, diesel, hybrid, EV, motorcycle) based on typical owner's-manual intervals. Every seeded task is fully editable, so the first thing to do after adding a vehicle is a quick pass to match your actual owner's manual — after that it's exactly what you configured.

**Reminders show up in-app by default.** Out of the box (no setup beyond this repo), reminders appear as a banner when you open GearLog, plus an optional "Enable browser notifications" toggle that fires a local notification at that moment if something's overdue.

**Background reminders (while the app is closed) are optional and require a tiny separate backend.** See the companion `gearlog-push` project (not part of this repo's static files - it's a small Cloudflare Worker you deploy yourself). It checks twice a day and can notify you even without opening GearLog, but only for date-based reminders (mileage-logging nudges, and tasks with a months-based interval) — it deliberately never receives your mileage numbers, VIN, or history, only a device token and short reminder text. `gearlog-push/README.md` has the full setup, and GearLog's own Settings → Background reminders section is where you plug in the Worker URL once it's deployed.

## Data & privacy

Everything lives in your browser's local storage on the device you use — nothing is sent anywhere. That also means data is per-browser/per-device: use Export/Import to move it, and it's worth exporting a backup occasionally (browser storage can be cleared by "clear site data" or a phone reset).
