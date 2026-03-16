## Worklog

- Added WordPress GraphQL auth fallback: tries bearer then Basic (app password) and normalizes endpoint; applied to public client, course access, and admin health.  
- Fixed shop/event entity rendering by decoding HTML entities for titles/prices/descriptions and Paywall prices; ensured shop CTA buttons force white text.  
- Enabled dual access backends: WordPress GraphQL remains primary while Cloudflare KV is mirrored when configured; access checks fall back to KV.  
- Added upload destination selector (WordPress vs R2/S3) in admin, with backend-aware upload/presigned/multipart APIs and configuration exposure in admin UI/health data.  
- Updated environment/exported settings to show access replicas, upload backend, and clearer email configuration hints; `.env.example` documents Basic auth fields.  
- Ran `npm run build` (passes; only Next image lint warnings remain).
- Added REST fallback for pages/posts/events and LearnPress `lpCourse` lookup by URI/slug to reduce 404s; documented content fallback logic.  
- Event list titles/excerpts decode entities; featured images hide on error; shop/product detail images also hide on error.  
- Admin advanced shows last deploy timestamp from env (LAST_DEPLOYED_AT or Vercel vars).
- Edge-safe storage: avoid fs read/write on Cloudflare runtimes; fall back to KV/in-memory.  
- Upload UX: clearer WP media failure hints; toast errors instead of silent failures; save label clarified.  
- 404 CTA forced to white text; admin shop thumbnails enlarged (32x32).  
