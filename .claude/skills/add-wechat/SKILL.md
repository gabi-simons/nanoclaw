---
name: add-wechat
description: Add WeChat (personal) channel integration via Tencent's official iLink Bot API. Uses long-polling and QR scan — no webhook, no ToS risk, no paid token.
---

# Add WeChat Channel

Adds WeChat support via **iLink Bot API** — the first-party Tencent API for personal WeChat bots (different from WeCom / Official Account).

**Why this is different from wechaty/PadLocal:**

- Official Tencent API — no ToS violation, no ban risk
- Free — no PadLocal token required
- No public webhook URL needed — uses long-poll
- Works with any personal WeChat account

## Prerequisites

- A **personal WeChat account** with the mobile app installed
- A phone to scan the QR code for login
- Node.js >= 20 (already required by NanoClaw)

## Install

NanoClaw doesn't ship channels in trunk. This skill copies the WeChat adapter in from the `channels` branch.

### Pre-flight (idempotent)

Skip to **Credentials** if all of these are already in place:

- `src/channels/wechat.ts` exists
- `src/channels/index.ts` contains `import './wechat.js';`
- `wechat-ilink-client` is listed in `package.json` dependencies

Otherwise continue. Every step below is safe to re-run.

### 1. Fetch the channels branch

```bash
git fetch origin channels
```

### 2. Copy the adapter

```bash
git show origin/channels:src/channels/wechat.ts > src/channels/wechat.ts
```

### 3. Append the self-registration import

Append to `src/channels/index.ts` (skip if the line is already present):

```typescript
import './wechat.js';
```

### 4. Install the library (pinned)

```bash
pnpm install wechat-ilink-client@0.1.0
```

### 5. Build

```bash
pnpm run build
```

## Credentials

Unlike most channels, WeChat requires **no pre-configured API keys**. Auth happens via QR code scan from your phone.

### 1. Enable the channel

Add to `.env`:

```bash
WECHAT_ENABLED=true
```

Sync to container: `mkdir -p data/env && cp .env data/env/env`

### 2. Start the service and scan the QR

Restart NanoClaw:

```bash
systemctl --user restart nanoclaw   # Linux
# or
launchctl kickstart -k gui/$(id -u)/com.nanoclaw   # macOS
```

The adapter will print a **QR URL** to the logs and save it to `data/wechat/qr.txt`:

```bash
tail -f logs/nanoclaw.log | grep WeChat
# or
cat data/wechat/qr.txt
```

Open the URL in a browser (it renders a QR code), then:

1. Open WeChat on your phone
2. Use its built-in QR scanner (top-right "+" → Scan)
3. Approve the authorization on your phone
4. Auth credentials are saved to `data/wechat/auth.json` — do not commit this file

The bot is now connected as your WeChat account.

## Wiring

Ask the user: **Who should the bot respond to — DMs only, or also group chats?**

Message someone (or a group) from the bot's WeChat account to seed the messaging group, then wire it. Or send the bot a DM from another account and wire the auto-created messaging group.

```sql
-- Example DM wiring (replace <user_id> with the contact's WeChat ID)
INSERT INTO messaging_groups (id, channel_type, platform_id, name, is_group, unknown_sender_policy, created_at)
VALUES ('mg-wechat-dm-alice', 'wechat', 'wechat:<user_id>', 'Alice (WeChat)', 0, 'public', datetime('now'));

INSERT INTO messaging_group_agents (id, messaging_group_id, agent_group_id, trigger_rules, response_scope, session_mode, priority, created_at)
VALUES ('mga-wechat-dm-alice', 'mg-wechat-dm-alice', '<your-agent-group-id>', '', 'all', 'shared', 10, datetime('now'));
```

To find `<user_id>`:

1. Send the bot a message from the target account
2. Check the logs: `grep "Auto-created messaging group" logs/nanoclaw.log | grep wechat`
3. The platform_id will look like `wechat:wxid_xxxxxx`

Use `shared` session mode (WeChat has no threading).

## Operational notes

- **Only one instance can use a given token at a time.** Don't run multiple NanoClaw instances pointing to the same `data/wechat/auth.json`.
- **Re-login on session expiry:** if you see `WeChat: session expired` in logs, delete `data/wechat/auth.json` and restart — you'll be asked to re-scan.
- **Sync cursor persistence:** `data/wechat/sync-buf.txt` holds the long-poll cursor. Deleting it replays recent history on next start; don't delete it in normal operation.
- **Account safety:** this uses the official Tencent API, so account bans for bot automation aren't a risk. That said, don't spam — normal rate limits still apply.

## Next Steps

If you're in the middle of `/setup`, return to the setup flow now.

Otherwise, restart the service to pick up the new channel and wiring.

## Channel Info

- **type**: `wechat`
- **terminology**: WeChat has "contacts" (DMs) and "group chats" (rooms). Each DM or group is a separate messaging group.
- **how-to-find-id**: Send a message to the bot from the target account; the adapter auto-creates a messaging group. Use `wechat:<user_id>` for DMs, `wechat:<group_id>` for rooms.
- **supports-threads**: no (WeChat has no reply threads)
- **typical-use**: Long-poll — the adapter holds a persistent connection to Tencent's iLink API and receives messages in real time. No webhook URL needed.
- **default-isolation**: `shared` session mode per messaging group (DM or room). Use `strict` sender policy if you want only specific users to reach the agent; `public` opens it to anyone who messages the bot.
