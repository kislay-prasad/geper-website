/**
 * Cloudflare Worker handler: POST /api/contact (routed from worker/index.ts)
 *
 * Validates the contact form, then asks Resend to email it to GEPER.
 * Success is only reported when Resend accepts the message and returns an id.
 *
 * Environment (Worker → Settings → Variables and Secrets; locally .dev.vars):
 *   RESEND_API_KEY  (secret, required)
 *   CONTACT_TO      (optional, default contact@geper.in)
 *   CONTACT_FROM    (optional, default "GEPER Website <onboarding@resend.dev>";
 *                    configure a verified notify.geper.in sender for production)
 *   ALLOWED_ORIGINS (optional, comma-separated origins; same-origin is always allowed)
 */
