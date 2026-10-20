# FirstRun Press Kit

## Short description

FirstRun is a GitHub Action that runs explicitly marked setup commands from a README on an Ubuntu runner, helping maintainers catch onboarding instructions that have gone stale.

## Launch draft

**Introducing FirstRun:** a small GitHub Action for checking whether the setup commands you document still work. Mark the README commands you want checked with `bash firstrun`, then let a pull request workflow run them on Ubuntu and report the result in the job summary. FirstRun is open source under the MIT License. It executes the commands you mark, so review them and use a workflow with minimal permissions and no secrets.

Project: https://github.com/mulhans100-a11y/firstrun
