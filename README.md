# MHS Clinic

Installable web app (PWA) for the clinic's daily surface. **This repo is the shell only**: HTML, JS, CSS, icons, manifest, service worker. No patient data, no flow URLs, no secrets. Demo mode (`?demo=1`) uses invented codes.

- Data lives in OneDrive under `/Clinic Apps/<clinic>/`. A page on github.io can't read OneDrive share links (CORS, confirmed 2026-11-12), so every read goes through the **Clinic App · Read** flow.
- Sign-in: the **Clinic App · Auth** flow sends a one-time code to the person's own Teams (Workflows card with a one-tap Sign in button) and swaps it for a session token. Each read re-checks the person's row in `tblAppUsers`. Build sheet: `flows/clinic-app-sign-in.html` (regenerate with `node flows/build.js`).
- Writes (phase 2 on) go through Power Automate HTTP triggers with the same token. The app never writes a file.
- The service worker caches the shell files listed in `sw.js` and nothing else.

## Files

| Path | What |
|---|---|
| `js/shell-config.js` | The Auth and Read flow URLs. Public by design; the session token is the lock. |
| `js/core.js` | Pure logic: counts, row flag, sort, LASFIR guard. |
| `js/data.js` | Every call to the flows. |
| `js/app.js` | UI. |
| `probe.html` | OneDrive direct-read test (result: blocked). Kept for reference. |
| `templates/` | `config.json` template. Fill and save in OneDrive as `/Clinic Apps/<clinic>/config.json`, not here. |
| `flows/` | Build sheet for the Auth and Read flows. |

## readiness.json (written per clinic by the appointment-readiness run)

```json
{ "generatedAt": "ISO time", "clinic": "castro",
  "days": { "YYYY-MM-DD": [ {
    "time": "9:00 AM", "lasfir": "SMIJAN", "mrn": "", "visit": "", "kind": "TMS|TMS F/U|ESK|IVK|Other",
    "payer": "", "inLuma": "$20|blank", "expected": "$20", "basis": "",
    "check": "OK|Missing in Luma|Luma too high|Luma too low|Needs BIDF|Nothing on file|Nothing to compare",
    "checklist": "Done|Not done|None", "checklistCheck": "", "issues": [""], "ivn": [""],
    "arrived": false, "collected": "", "cardOnFile": "Yes|No|", "verbalConsent": "Yes|No|",
    "dedLeft": "", "oopmLeft": "" } ] } }
```

Days older than today are dropped on each write. The file is overwritten in place so its share link keeps working.
