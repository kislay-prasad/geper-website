# Security policy

## Reporting a vulnerability

Please report suspected security issues in the GEPER website privately, by email to **contact@geper.in**
with the subject line "Security". Do not open a public issue or pull request for a vulnerability.

Helpful details: what you found, the URL or component, steps to reproduce, and what you think the impact is.
Please do not include real personal data. We will acknowledge reports on a best-effort basis and will not
take action against good-faith research that stays within the limits below.

## Scope

In scope: the public website at https://geper.in, its contact form and `/api/contact` endpoint, and the code in this repository.

Out of scope: denial-of-service or load testing, social engineering of GEPER staff or visitors, spam through the
contact form, physical attacks, and third-party services (Cloudflare, Resend, Zoho Mail) themselves.

## Please do not

- Access, change or delete data that is not yours.
- Send automated bulk submissions through the contact form.
- Publicly disclose an issue before we have had a reasonable chance to fix it.

## How the site is protected

The contact form is verified server-side with Cloudflare Turnstile and fails closed. Requests are checked for a
matching origin, size and format, and rate limited. Security headers and a Content Security Policy are applied to every page.
Dependencies are monitored with Dependabot and checked in CI. Secrets are stored as Worker secrets and are never committed.
