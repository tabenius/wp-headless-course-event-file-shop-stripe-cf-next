# Cloudflare Workers (med Next-kompatibilitet)

Projektet är förberett för Cloudflare Workers via OpenNext.

## 1) Installera verktyg

```bash
npm install
```

Nya scripts:

- `npm run cf:build`
- `npm run cf:preview`
- `npm run cf:deploy`

## 2) Konfiguration

Se `wrangler.jsonc`.

Viktigt:

- `compatibility_flags: ["nodejs_compat"]` för maximal Next-kompatibilitet.
- `CLOUDFLARE_IMAGE_RESIZING=1` aktiverar Cloudflare bildoptimering för `next/image`.
- `COURSE_ACCESS_STORE=cloudflare` och `USER_STORE_BACKEND=cloudflare` gör att state lagras i Cloudflare KV istället för lokalt filsystem.

## 3) KV och miljövariabler

Du behöver:

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `CF_KV_NAMESPACE_ID`

Valfritt:

- `CF_KV_KEY` (default: `course-access`)
- `CF_USERS_KV_KEY` (default: `users`)

Auth/Stripe/WordPress-variabler fungerar som tidigare.

## 4) Bilder och typsnitt

- Typsnitt: `next/font/google` används fortsatt (förstahandsval).
- Bilder: `next/image` används fortsatt.
  När `CLOUDFLARE_IMAGE_RESIZING=1` används Cloudflare `/cdn-cgi/image/...` via custom loader.

## 5) Vad går att exportera statiskt?

Ren statisk export fungerar bara för rena innehållssidor.
Följande kräver serverruntime (Next/Workers):

- inloggning/registrering
- admin UI/API
- kursåtkomst-kontroll
- Stripe checkout/webhook

Om ni vill köra helt utan Next runtime måste dessa flyttas till separat backend (t.ex. Workers API) och frontend bli helt statisk.
