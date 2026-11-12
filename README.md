# MHS Clinic

Installable web app (PWA) for the clinic's daily surface. **This repo is the shell only**: HTML, JS, CSS, icons, manifest, service worker. No patient data, no flow URLs, no secrets. Demo mode (`?demo=1`) uses invented codes.

- Data lives in OneDrive under `/Clinic Apps/<clinic>/`, shared "People in Mindful Health Solutions" only. The app reads it with the user's own Microsoft sign-in.
- Writes (phase 2 on) go through Power Automate HTTP triggers. The app never writes a file.
- The service worker caches the shell files listed in `sw.js` and nothing else.

## Files

| Path | What |
|---|---|
| `js/shell-config.js` | The share link to `/Clinic Apps/index.json`. The only setting in the repo. |
| `js/core.js` | Pure logic: counts, row flag, sort, LASFIR guard. |
| `js/data.js` | Every read. Swap this if direct OneDrive reads are blocked. |
| `js/app.js` | UI. |
| `probe.html` | Tests whether this origin can read a OneDrive share link. Phase 1 gate. |
| `templates/` | `config.json` and `index.json` templates. Fill and save in OneDrive, not here. |

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
