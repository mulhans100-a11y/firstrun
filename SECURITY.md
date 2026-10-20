# Security Policy

## Scope

FirstRun runs explicitly marked `bash firstrun` blocks from a README on an Ubuntu GitHub Actions runner. Those commands can access the checked-out workspace, available system tools, and the network. FirstRun is not a complete sandbox.

The action does not forward GitHub secrets or its environment to the Bash processes. It gives them a limited allowlist of ordinary runner variables and a temporary empty home directory. Workflows should use `permissions: contents: read`, trigger on `pull_request` rather than `pull_request_target`, avoid defining secrets for this job, and disable checkout credential persistence when using `actions/checkout`.

FirstRun does not send code or logs to external services and does not collect telemetry.

## Reporting a vulnerability

Please report security issues privately through the repository's GitHub Security tab if private vulnerability reporting is enabled. If it is unavailable, contact the maintainers privately through their GitHub profile before publishing details. Please include a concise description, affected version or commit, and steps to reproduce. Do not include real secrets in a report.

## Supported versions

Security fixes are made to the current release line. Users should update to the latest tagged release.
