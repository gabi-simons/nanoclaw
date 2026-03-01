# Intent: src/container-runner.ts modifications

## What changed
Added `GITHUB_TOKEN` and `GH_REPO` to the `readSecrets()` allowlist so they are passed to the container via stdin JSON.

## Key sections

### readSecrets()
- Added two keys to the array passed to `readEnvFile()`:
  ```typescript
  function readSecrets(): Record<string, string> {
    return readEnvFile([
      'CLAUDE_CODE_OAUTH_TOKEN',
      'ANTHROPIC_API_KEY',
      'GITHUB_TOKEN',
      'GH_REPO',
    ]);
  }
  ```
- These values flow via stdin → `containerInput.secrets` → `sdkEnv` → available to Bash
- `GITHUB_TOKEN` and `GH_REPO` are NOT added to `SECRET_ENV_VARS` in agent-runner because `gh` CLI needs them visible in Bash commands

## Invariants
- All existing secrets (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`) are unchanged
- The stdin-based secret passing flow is unchanged
- No changes to volume mounts, container args, or any other functions
- The `SECRET_ENV_VARS` list in agent-runner is NOT modified (gh needs these env vars)

## Must-keep
- All existing volume mounts
- The mount security model
- Container lifecycle (spawn, timeout, output parsing)
- The `buildContainerArgs`, `runContainerAgent`, and all other functions
