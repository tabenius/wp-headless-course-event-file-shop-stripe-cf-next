# xtas.nu Tenant Override

Tenant-specific values for the `xtas.nu` profile are isolated here.

## Purpose

This directory keeps tenant branding/domain constants out of shared app code.

## Data file

- `config.js` — domain, support email/BCC, pseudo-external link hosts, and demo admin emails.

## Activation

Set `NEXT_PUBLIC_TENANT_KEY=xtas.nu` (or `TENANT_KEY=xtas.nu` on server-only flows).

