# Password Reset via Resend Email

## Overview

Add a "Forgot password?" flow to the sign-in form. Users enter their email, receive a reset link via Resend, and set a new password.

## UI

- Sign-in form gets a "Forgot password?" link below the password field.
- Clicking it toggles to an email-only form with a "Send reset link" button.
- After submit: always shows a success message (prevents email enumeration).
- Reset link leads to `/auth/reset-password?token=<token>` with a new-password form.

## Endpoints

| Endpoint                    | Method | Purpose                                                                                 |
| --------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `/api/auth/forgot-password` | POST   | Accepts `{ email }`, generates token, stores in KV (TTL 24h), sends email via Resend    |
| `/api/auth/reset-password`  | POST   | Accepts `{ token, password }`, validates token from KV, updates password, deletes token |

## Token Storage (Cloudflare KV)

- Key: `password-reset:<uuid>`
- Value: `{ email, createdAt }`
- TTL: 86400 seconds (24 hours), auto-deleted

## Email Delivery

- `fetch("https://api.resend.com/emails", ...)` with Bearer token
- Env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Plain HTML body with reset link

## Security

- Crypto-random UUID token
- One-time use (deleted after successful reset)
- Same response whether email exists or not
- 8-character password minimum (matches registration)

## New Environment Variables

- `RESEND_API_KEY` — Resend API key
- `RESEND_FROM_EMAIL` — verified sender address (e.g. `noreply@example.com`)
