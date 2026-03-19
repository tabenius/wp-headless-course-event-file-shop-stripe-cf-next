---
name: cf-tail
description: Check build lock, deploy to Cloudflare Workers, then stream live logs with wrangler tail. Use when you want to ship and immediately watch production logs.
disable-model-invocation: true
---

Run these steps in order and report the result of each:

1. **Check build lock** — if `building.lock.pid` exists, print its contents and stop. Do not proceed while another build is running.

```bash
if [ -f building.lock.pid ]; then
  echo "BUILD LOCK HELD:"
  cat building.lock.pid
  echo ""
  echo "Resolve the lock before deploying. Delete it with: rm building.lock.pid (only if process is gone)"
  exit 1
fi
echo "Lock free — proceeding."
```

2. **Deploy**

```bash
npm run cf:deploy
```

3. **If deploy succeeded, stream live logs** (Ctrl+C to stop)

```bash
npx wrangler tail --format pretty
```

Report success or failure at each step. If deploy fails, show the last 20 lines of output for diagnosis.
