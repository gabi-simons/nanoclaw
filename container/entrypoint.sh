#!/bin/bash
set -e

# --- Build phase (as root) ---
cd /app && npx tsc --outDir /tmp/dist 2>&1 >&2
ln -s /app/node_modules /tmp/dist/node_modules
chmod -R a-w /tmp/dist

# --- Security: /proc hardening ---
# Remount /proc with hidepid=2 so processes cannot see other processes'
# /proc/PID entries. This blocks the /proc/$PPID/environ attack vector
# where Bash tool commands read the CLI subprocess's API key.
if mount -o remount,hidepid=2 /proc 2>/dev/null; then
    echo "[entrypoint] /proc remounted with hidepid=2" >&2
else
    echo "[entrypoint] WARNING: hidepid=2 failed - falling back to hook-only defense" >&2
fi

# --- Read input and drop privileges ---
cat > /tmp/input.json

TARGET_UID=${RUN_UID:-1000}
TARGET_GID=${RUN_GID:-1000}
chown "$TARGET_UID:$TARGET_GID" /tmp/input.json

# Drop to unprivileged user. The UID transition clears all capabilities
# (including SYS_ADMIN) per capabilities(7). --no-new-privs prevents
# regaining privileges via setuid binaries.
exec setpriv --reuid="$TARGET_UID" --regid="$TARGET_GID" --clear-groups \
    --no-new-privs node /tmp/dist/index.js < /tmp/input.json
