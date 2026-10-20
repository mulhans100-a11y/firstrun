# Contributing

Contributions that improve the action, documentation, or safety are welcome.

## Development setup

Use Node.js 24 or newer and npm:

```bash
npm ci
```

The action source is in `src/main.js`. The GitHub Action loads the committed bundle at `dist/index.js`, so rebuild it after changing source:

```bash
npm run build
npm run lint
```

Keep `dist/` and the generated `licenses.txt` in sync with the source dependencies. The CI workflow checks the README commands before installing development dependencies, then checks the bundle and lint rules.

## Pull requests

- Explain the user-facing behavior change.
- Update the README or security guidance when behavior changes.
- Keep workflow permissions minimal and pin external GitHub Actions to verified full commit SHAs with a version comment.
- Never add secrets, telemetry, or external code/log uploads.
- Do not add unmarked README commands to the execution path: only the exact `bash firstrun` fence is eligible.
