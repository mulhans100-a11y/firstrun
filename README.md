# FirstRun

[![CI](https://github.com/mulhans100-a11y/firstrun/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mulhans100-a11y/firstrun/actions/workflows/ci.yml)

FirstRun is a GitHub Action that checks whether the setup commands in a project's README work on a clean Ubuntu GitHub Actions runner. It gives maintainers a quick signal when documented onboarding steps stop matching the project.

## The problem

Setup instructions often drift as dependencies, scripts, and build tools change. Contributors then discover broken commands while trying to get started. FirstRun turns the commands you choose to mark in `README.md` into a CI check.

## How it works

1. FirstRun parses the configured README with a Markdown parser.
2. It selects only fenced code blocks whose info string is exactly `bash firstrun`.
3. It runs those blocks in document order, each in a fresh Bash process on the configured working directory.
4. It stops at the first failed block or when the total time limit is reached, then writes a short result to the GitHub job summary.

Unmarked code examples and other files are not selected or run by FirstRun. Commands inside a marked block can of course call scripts or tools in the repository.

## Installation

Add the action to a workflow after checking out your repository. Pin the action to a release tag, such as `v0.1.0`:

```yaml
name: FirstRun

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  firstrun:
    runs-on: ubuntu-24.04
    steps:
      # actions/checkout v7.0.1; credentials are not persisted in the checkout.
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - uses: mulhans100-a11y/firstrun@v0.1.0
```

The workflow uses `pull_request`, not `pull_request_target`, and grants only read access to repository contents. Keep FirstRun in its own job before any setup steps if you want the commands to start from the runner's clean checkout.

## README syntax

Use a fenced code block with the exact info string `bash firstrun`. For example, an ordinary Markdown example could be shown inside an unmarked `markdown` fence like this:

````markdown
```bash firstrun
npm ci
npm run build
```
````

Only the exact `bash firstrun` marker is accepted. Other languages, unmarked Bash blocks, and blocks with extra info words are ignored. All matching blocks run in their order in the README.

This repository checks its own documented build and lint steps with the same marker:

```bash firstrun
npm ci
npm run build
npm run lint
```

## Settings

| Input | Default | Description |
| --- | --- | --- |
| `readme-path` | `README.md` | README file path, relative to the checked-out workspace. |
| `working-directory` | `.` | Directory where every marked block starts, relative to the checked-out workspace. |
| `timeout-minutes` | `10` | Maximum total runtime for all marked blocks together. Must be a whole number from 1 to 360. |

Both paths must resolve inside the checked-out workspace. Each block starts in a separate Bash process, so shell variables and directory changes do not carry over between blocks. Bash runs without profile files and uses `-e` and `pipefail`.

## Output

A successful run reports how many blocks passed and adds a compact status row to the GitHub job summary. If there are no marked blocks, FirstRun fails with an example of how to add one. On failure it stops at the first block, reports that block and its exit code, and prints at most 6,000 characters each from captured stdout and stderr.

## Status badge

The badge at the top tracks the `main` branch's FirstRun CI workflow:

```markdown
[![CI](https://github.com/mulhans100-a11y/firstrun/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mulhans100-a11y/firstrun/actions/workflows/ci.yml)
```

## Security and limitations

FirstRun executes the marked README commands with Bash. It does not pass GitHub secrets or the action's environment to those commands; it passes only a small set of ordinary runner variables and uses a temporary, empty home directory. The example workflow also disables checkout credential persistence.

FirstRun is **not a complete sandbox**. Marked commands can read or change files in the workspace, use available system tools, and access the network. Do not put secrets in the job, and review README changes from pull requests before running them. FirstRun currently supports `README.md` (or another configured Markdown README), fenced Bash blocks, and Ubuntu Linux runners. It has no telemetry and does not send code or logs to an external service.

See [SECURITY.md](https://github.com/mulhans100-a11y/firstrun/blob/main/SECURITY.md) for reporting security issues and [CONTRIBUTING.md](https://github.com/mulhans100-a11y/firstrun/blob/main/CONTRIBUTING.md) for development guidance.
