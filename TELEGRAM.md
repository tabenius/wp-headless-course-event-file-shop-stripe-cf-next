# Telegram Bot Setup

## Prerequisites

- A Telegram account
- Access to the Cloudflare dashboard for ragbaz.xyz
- `wrangler` CLI authenticated

## Steps

### 1. Create the bot

Open Telegram and message [@BotFather](https://t.me/BotFather). Send `/newbot`, follow the prompts, and save the API token it gives you.

### 2. Get your Telegram user ID

Message [@userinfobot](https://t.me/userinfobot) on Telegram. It will reply with your numeric user ID.

### 3. Set secrets

```bash
cd ragbaz.xyz
wrangler secret put TELEGRAM_BOT_TOKEN
# Paste the token from BotFather

wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Paste a random string (e.g. output of: openssl rand -hex 32)
```

### 4. Set admin ID

Edit `ragbaz.xyz/wrangler.toml` and set your Telegram user ID:

```toml
TELEGRAM_ADMIN_ID = "123456789"
```

### 5. Deploy

```bash
cd ragbaz.xyz
npm run cf:deploy
```

### 6. Register the webhook

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://ragbaz.xyz/telegram-webhook","secret_token":"<WEBHOOK_SECRET>"}'
```

Replace `<TOKEN>` with the BotFather token and `<WEBHOOK_SECRET>` with the secret from step 3.

## Bot Commands

| Command | Description |
|---------|-------------|
| `/sites` | List connected WordPress sites |
| `/history` | Last 10 heartbeat connections |
| `/slow` | Recent bad web vitals events |
| `/performance` | Average TTFB, LCP, INP, CLS over last 24h |
| `/help` | Show available commands |

## Push Notifications

The bot automatically sends you a message when:

- A new site registers via the challenge-response handshake
- A heartbeat arrives (with safety/cache/vitals scores and recommendations)
- Any event is ingested (with severity indicator)

Notifications are fire-and-forget and never block API responses.

## Troubleshooting

**Bot not responding to commands:**
- Verify the webhook is registered: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Check that `TELEGRAM_ADMIN_ID` matches your actual Telegram user ID
- Check that `TELEGRAM_WEBHOOK_SECRET` matches what you passed to `setWebhook`

**Not receiving push notifications:**
- Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_ID` are both set (notifications are silently skipped if either is missing)
- Check Cloudflare Workers logs for `[telegram]` error messages
