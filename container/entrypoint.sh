#!/bin/bash
set -e

# Recompile agent-runner source (may be customized per group)
cd /app && npx tsc --outDir /tmp/dist 2>&1 >&2
ln -s /app/node_modules /tmp/dist/node_modules
chmod -R a-w /tmp/dist

# Buffer stdin (JSON with secrets — deleted by agent-runner after read)
cat > /tmp/input.json

# Drop privileges and run with a clean environment.
# env -i strips all inherited vars so /proc/<pid>/environ contains only
# the listed safe variables — no secrets.
exec env -i \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  HOME="/home/node" \
  NODE_PATH="/usr/local/lib/node_modules" \
  AGENT_BROWSER_EXECUTABLE_PATH="/usr/bin/chromium" \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium" \
  TZ="${TZ:-UTC}" \
  gosu "${RUN_UID:-1000}:${RUN_GID:-1000}" \
  node /tmp/dist/index.js < /tmp/input.json
