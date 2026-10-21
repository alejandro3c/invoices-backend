# Development fixtures

Fixtures define the whole local dataset. Every load empties the Firestore, Auth and Storage emulators and writes the selected scenarios, so the emulators always hold exactly what the fixtures describe and nothing else. Use it as the "start again" button after testing from the app.

They run straight from TypeScript with Node 24 (no build step) and reuse the functions' own code for totals, invoice numbering and PDF rendering, so the data matches what the app would produce.

## Usage

Start the emulators (`npm run dev` in the backend root), then from the same folder:

```bash
npm run fixtures                          # empty the emulators and load every scenario
npm run fixtures -- clients:alejandro     # empty them and load only this scenario and its dependencies
npm run fixtures -- --list                # registered scenarios and which are loaded
npm run fixtures -- --check               # check the loaded scenarios
```

- Emptying the emulators uses endpoints that only exist in the Firestore and Auth emulators, and the runner refuses any host that is not localhost, so it cannot reach a real project.
- The emulators export their data on exit (`exported-dev-data`), so what you do from the app survives a restart until you load the fixtures again.
- Loading checks every scenario afterwards; `--no-check` skips it.

## Scenarios

Sign in as `alejandro@invoices.test` with password `Fixture123!`. Every client is in Spain.

| Id | Contents |
| --- | --- |
| `users:alejandro` | A freelancer: default numbering (`2026-0001`), 21% VAT, 15% IRPF, three payment terms. |
| `clients:alejandro` | Three companies, a freelancer with only the required fields and a client without invoices. |
| `invoices:alejandro` | 2025 and 2026 invoices: paid, issued (one overdue), cancelled and two drafts; IRPF, line discounts and a goods sale. Issued invoices have their PDF in Storage, and the counters are set so issuing a draft gets `2026-0005`. |
| `recurring:alejandro` | Monthly and quarterly recurring invoices that are enabled, and a paused yearly one on day 31. |

Invoice dates are fixed, so "overdue" depends on today's date.

## Adding a scenario

1. Create `<area>/<name>.fixture.ts` exporting a `Fixture` with an `area:name` id, a description, `up` and `check`; add `dependsOn` when it needs other scenarios.
2. Write through the context (`setDocument`, `createAuthUser`, `saveFile`). The builders in `builders/` cover users, clients, invoices and recurring invoices.
3. Register it in `index.ts` and run `npm run test:fixtures` from `functions/`.
4. Bump `version` when you change its data; `--list` marks loaded copies with an older version as `OUTDATED`.
