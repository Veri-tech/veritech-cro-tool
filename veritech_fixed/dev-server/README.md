# Veritech CRO Tool

AI-powered CRO Intelligence Platform built by **Veritech Digital**.

> Phase 1 deliverable: full platform shell — auth, routing, role-based
> portals (Super Admin, Agency Admin, Client), database schema with strict
> tenant isolation, design system, and static pages. Feature workflows
> (audits, market share, integrations, billing) ship in Phases 2–6.

---

## Stack

- **TanStack Start** (React 19, TypeScript strict, Vite 7) — file-based routing,
  server functions, SSR-capable.
- **Lovable Cloud** — managed PostgreSQL + Auth + Storage (Supabase under the
  hood). Tokens, RLS, storage buckets, edge functions all provisioned for you.
- **Tailwind CSS v4** — CSS-first design tokens, `@theme` + `@utility` for the
  Veritech palette.
- **TanStack Query** — data fetching + cache.

---

## Project structure

```
src/
├── routes/                     File-based routes
│   ├── __root.tsx              Root shell (fonts, favicon, toaster, metadata)
│   ├── index.tsx               Root redirect by role
│   ├── login.tsx               Auth pages
│   ├── register.tsx
│   ├── forgot-password.tsx
│   ├── reset-password.tsx
│   ├── accept-invite.tsx
│   ├── privacy.tsx / terms.tsx / account-closed.tsx
│   ├── _app.tsx                Pathless gate: requires auth
│   ├── _app.dashboard.*        Agency-admin portal
│   ├── _app.portal.*           Client portal
│   └── _app.admin.*            Super-admin portal
├── components/                 Shared UI (Toast, Skeleton, AuthShell, Logo, StubPage)
├── lib/
│   ├── auth.ts                 useSession() + role helpers
│   └── validate.ts             validateAuditUrl()
└── styles.css                  Design tokens (Veritech palette + utilities)
```

---

## Initial setup

### 1. Local environment

```bash
cp .env.example .env.local
```

Fill the keys you have. On Lovable, the Cloud (Supabase) variables are
auto-injected — no manual paste needed in dev.

### 2. Backend provisioning (Lovable Cloud)

Lovable Cloud is already enabled on this project. The Phase 1 migrations
created:

- 14 tables (`agencies`, `profiles`, `clients`, `audits`, `competitors`,
  `competitor_audits`, `client_invitations`, `audit_requests`, `audit_queue`,
  `market_share_jobs`, `api_usage_log`, `client_integrations`, `notifications`,
  `system_config`).
- The `client_integrations_safe` view (excludes encrypted token columns).
- Row-Level Security on every table, scoped by role.
- Storage buckets `audit-reports` and `agency-assets` (both private) with
  per-agency / per-client folder-based access rules.
- Seeded `system_config` defaults (`default_daily_audit_limit=10`,
  `default_monthly_token_budget=2000000`, support + privacy emails).

### 3. Create the super-admin user

There is no public super-admin signup — security-by-design. To create one
after first deploy:

1. Open Lovable Cloud → Users → invite a new user with email + temporary
   password (or create with the admin API).
2. Run, via Lovable Cloud's SQL console:

   ```sql
   INSERT INTO public.profiles (id, agency_id, role, full_name)
   VALUES ('<auth-user-id>', NULL, 'super_admin', 'Veritech Admin');
   ```

3. Update the same user's `user_metadata` so the client knows the role
   without a profile fetch:

   ```sql
   UPDATE auth.users
   SET raw_user_meta_data = jsonb_build_object('role', 'super_admin', 'agency_id', null)
   WHERE id = '<auth-user-id>';
   ```

### 4. Deployment

The app deploys via Lovable's **Publish** button. Lovable hosts both the
client bundle and the TanStack server runtime on Cloudflare Workers — no
Vercel account or `vercel.json` is required.

### 5. Google Cloud (Phase 5 — GA4 + Search Console OAuth)

Will be wired in Phase 5. When you reach it, create an OAuth Client ID in
the Google Cloud Console for `https://<your-app>.lovable.app` with the
following scopes: `https://www.googleapis.com/auth/analytics.readonly`,
`https://www.googleapis.com/auth/webmasters.readonly`, plus openid /
email / profile. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 6. Semrush developer app (Phase 5)

Register at the Semrush developer portal, request OAuth credentials, set
`SEMRUSH_CLIENT_ID` and `SEMRUSH_CLIENT_SECRET`.

### 7. Resend (Phase 2 — invitations, password resets)

Add and verify your sending domain at Resend. Set `RESEND_API_KEY`.

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public backend URL (auto-set by Lovable Cloud) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key (auto-set) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key — never exposed |
| `ANTHROPIC_API_KEY` | LLM for audit generation (Phase 3) |
| `NEXT_PUBLIC_APP_URL` | Public app URL, used in email links |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Per-client GA4 + GSC OAuth |
| `SEMRUSH_CLIENT_ID` / `SEMRUSH_CLIENT_SECRET` | Semrush OAuth |
| `RESEND_API_KEY` | Outbound email |
| `SUPABASE_ENCRYPTION_KEY` | AES-256 key for OAuth token encryption at rest |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Fallback traffic data |

---

## Design system

Palette is defined as CSS tokens in `src/styles.css`:

| Token | Hex |
| --- | --- |
| `--navy` | `#0A1628` (page bg) |
| `--navy2` | `#111e35` (card) |
| `--slate` | `#1e293b` |
| `--accent` | `#4F8CFF` (primary) |
| `--teal` | `#00C4CC` |
| `--green` | `#22C55E` |
| `--amber` | `#F59E0B` |
| `--red` | `#EF4444` |
| `--muted` | `#94a3b8` |
| `--light` | `#e2e8f0` |

Fonts: **Inter** body, **JetBrains Mono** for scores / numbers. CRO score
colour bands: 0–30 red, 31–65 amber, 66–80 blue, 81–100 green.

Use the `vt-*` utilities (`vt-card`, `vt-input`, `vt-btn-primary`,
`vt-btn-secondary`, `vt-skeleton`, `vt-progress-bar`) defined in
`src/styles.css` — never hardcode colours in components.

---

## Conventions

- Email/password is the only auth method in Phase 1; OAuth providers are
  feature-scoped (per-client integrations).
- Role lives in `profiles.role` AND `auth.users.user_metadata.role` — RLS
  uses the table; the client uses metadata for fast routing decisions.
- Every CRUD against `auth.users` happens via the backend; the browser only
  touches `profiles`.
- Audit-report PDFs are stored at `audit-reports/{agency_id}/{client_id}/{audit_id}.pdf`.
- Agency assets are at `agency-assets/{agency_id}/...`.

---

## Support

- Product: [veritechdigital.co.za](https://veritechdigital.co.za)
- Support: support@veritechdigital.co.za
- Privacy: privacy@veritechdigital.co.za
