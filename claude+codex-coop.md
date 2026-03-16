## Worklog

- Added WordPress GraphQL auth fallback: tries bearer then Basic (app password) and normalizes endpoint; applied to public client, course access, and admin health.  
- Fixed shop/event entity rendering by decoding HTML entities for titles/prices/descriptions and Paywall prices; ensured shop CTA buttons force white text.  
- Enabled dual access backends: WordPress GraphQL remains primary while Cloudflare KV is mirrored when configured; access checks fall back to KV.  
- Added upload destination selector (WordPress vs R2/S3) in admin, with backend-aware upload/presigned/multipart APIs and configuration exposure in admin UI/health data.  
- Updated environment/exported settings to show access replicas, upload backend, and clearer email configuration hints; `.env.example` documents Basic auth fields.  
- Ran `npm run build` (passes; only Next image lint warnings remain).
