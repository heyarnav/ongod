# on god.

A clothing archive documenting the human experience through three realms —
HUMAN, CELESTIAL and DIVINE.

```
Next.js  →  Supabase
              ├── PostgreSQL   (the only database)
              ├── Auth         (the only identity system)
              ├── Storage      (the only media system)
              └── RLS          (the security boundary)
```

There is no Prisma. There is no SQLite. There is no WooCommerce. There is no
second database and no ORM layer in front of any of this.

---

## Getting started

```bash
cp .env.example .env     # then fill in the three Supabase keys
npm install
npm run db:migrate       # creates the schema, RLS, bucket and seed data
npm run media:import     # uploads public/images + public/models to Storage
npm run dev              # http://localhost:3000

# one operator step, after you create the account in Supabase:
npm run admin:grant you@yourdomain.com
```

The Control Room is **locked** until you run `npm run admin:grant`. Until
`admin_users` has a row, `/admin` bounces everyone — including a signed-in
customer — and every admin API route returns 403. That is the intended
default, not a misconfiguration.

### Environment

| Variable | Where it runs | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | public key; safe because RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses RLS. Never imported by a `"use client"` module |
| `SUPABASE_DB_URL` | scripts only | direct Postgres connection for `npm run db:migrate` |
| _(no operator credential)_ | — | the password lives in Supabase Auth, never in `.env`. See "The operator" |

Razorpay variables exist and are intentionally empty. The order flow never
reads them unless every server-side value is present, so `payment_status`
stays `PENDING`.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server on :3000 |
| `npm run build` / `npm start` | production build / serve on :3000 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | applies `supabase/migrations/*.sql` in order, recording each in `supabase_migrations.schema_migrations` |
| `npm run db:reset` | drops the public schema and reapplies from zero |
| `npm run db:seed` | re-runs only the seed migration (idempotent) |
| `npm run admin:grant you@yourdomain.com` | writes the operator's `admin_users` grant; refuses to add a second one unless `--force` |
| `npm run admin:password you@yourdomain.com` | sets the operator's Auth password at a hidden prompt and verifies it with a real sign-in — no recovery email, no `.env` |
| `npm run media:import` | uploads `public/images` + `public/models` into the `ongod-media` bucket |
| `node scripts/verify-schema.mjs` | read-only: asserts the live database matches what the app expects |
| `node scripts/e2e.mjs` | end-to-end tests against the running app and live database |

`scripts/verify-schema.mjs` and `scripts/e2e.mjs` need the app running
(`npm start`) for the latter.

---

## Migrations

`supabase/migrations/` is the source of truth. The database is reproducible
from nothing but these files.

| File | Contents |
|---|---|
| `0001_initial_schema.sql` | all tables, indexes, constraints, the `updated_at` trigger |
| `0002_functions.sql` | `generate_order_number()`, the `place_order()` RPC |
| `0003_rls.sql` | helper functions and every row level security policy |
| `0004_storage.sql` | the `ongod-media` bucket and its storage policies |
| `0005_seed_data.sql` | three realms, HUMAN / 001, variants, images, site copy, dispatches |
| `0006_storage_media_types.sql` | widens the bucket MIME allowlist to include the 3D model |

Never edit an applied migration. Add a new one.

---

## Schema

`customers` · `addresses` · `collections` · `products` · `product_variants` ·
`product_images` · `orders` · `order_items` · `admin_users` ·
`site_settings` · `analytics_events` · `journal_entries`

Notes that matter:

- **Money is integer minor units.** ₹3,499 is stored as `349900`. No floats.
- **Orders freeze their address.** `shipping_*` on `orders` is written once at
  checkout and never re-derived. Editing or deleting the saved address cannot
  rewrite what an order shipped to.
- **Order items freeze their product.** `product_name`, `variant_size` and
  `unit_price` are snapshots. Renaming or repricing a product leaves history
  correct.
- **At most one default address per customer**, enforced by a partial unique
  index rather than by application discipline.
- There is no `payments` table and no `issues` table. Payment state lives on
  the order; the complaint system was removed from the architecture.

---

## Security

Identity resolves as `auth.uid() → customers.supabase_user_id → customers.id`,
and RLS is what actually enforces it.

- Customer-owned tables (`customers`, `addresses`, `orders`, `order_items`)
  are readable and writable only by the row's owner.
- Nothing customer-owned has an insert policy except `customers` itself, so a
  client cannot fabricate an order or rewrite a frozen snapshot.
- `place_order()` is `SECURITY DEFINER`, takes **no customer id**, and resolves
  the caller from `auth.uid()`. It is granted to `authenticated` only.
- Admin routes call `requireAdmin()`, which revalidates the session and then
  requires a row in `admin_users`. Signing in as a Supabase user grants nothing.
- `middleware.ts` only redirects. Its redirect decision uses `getClaims()`,
  which validates the JWT locally with no network call; the real authorization
  happens in the layout and in every route.

### Inventory

Stock is never read-then-written in JavaScript. `place_order()` runs:

```sql
UPDATE product_variants
   SET stock = stock - p_quantity
 WHERE id = p_variant_id AND stock >= p_quantity;
```

If that affects zero rows the transaction raises `STOCK_DEPLETED` and rolls
back. Two simultaneous buyers cannot both take the last unit.

---

## Clients

`src/lib/supabase/`

| File | Use |
|---|---|
| `browser.ts` | anon key; sign-in, OTP |
| `server.ts` | request-scoped, carries the visitor's JWT — **this is what makes RLS apply** |
| `admin.ts` | service role, `server-only`, only after `requireAdmin()` |
| `session.ts` | `getCustomer()`, `requireCustomer()`, `requireAdmin()` |
| `storage-url.ts` | resolves a storage path to a public URL |

---

## The operator

Control Room access is two things stacked:

1. a Supabase Auth account (the credential), and
2. a row in `admin_users` keyed on that account's `auth.users.id` (the grant).

Signing in on its own buys nothing. A customer who signs in normally is
authenticated and still refused by `requireAdmin()`.

```bash
# 1. In the dashboard: Authentication -> Users -> "Add user"
# 2. Then, in this repo:
npm run admin:password you@yourdomain.com   # sets the password, no email involved
npm run admin:grant    you@yourdomain.com   # writes the grant
```

`admin:password` exists because **Supabase's built-in email provider allows 2
emails per hour, project-wide** (dashboard: Authentication → Rate Limits). That
cap cannot be raised without custom SMTP or a Send Email hook, so "forgot
password" fails with *email rate limit exceeded* no matter how often you click —
along with a 60-second per-user window and a 30-per-5-minutes IP bucket on
`/auth/v1/recover`. So this project never depends on recovery email: the service
role writes the password straight to the auth user, then signs in with it to
prove it worked. The password is typed at a hidden prompt (twice), never passed
as an argument, never written to disk, and Supabase keeps only its bcrypt hash.

`admin:grant` never receives a password. It looks the account up in Supabase
Auth, errors if it does not exist, and writes only the grant.

`admin:grant` **refuses to add a second operator.** If `admin_users` already has
a row for a different account, it stops and tells you who holds the role, because
granting full read access to every order, customer and price should be a
deliberate act. Re-running with the *same* email is idempotent. `--force`
overrides the guard. Deleting the `admin_users` row demotes the account to an
ordinary customer immediately — no other change needed.

`scripts/e2e.mjs` signs in as the operator without ever holding its password: it
uses the service role to generate a magiclink and exchanges it for a session.

---

## Email

**Customers sign in with a one-time code, so every login is an email.** Custom
SMTP is configured (Mailtrap Email Sending, on a verified custom domain) and a
live `POST /auth/v1/otp` now returns `200` — verified, not assumed.

It was built that way because Supabase's built-in sender cannot carry a store.
Two facts about it, both documented and neither adjustable while it is in use:

| | built-in SMTP | custom SMTP |
|---|---|---|
| messages per hour | **2**, whole project | 30, then raise it yourself |
| who may receive | **team members only** | anyone |
| delivery guarantee | none | your provider's |

That means an address outside your organisation fails with *Email address not
authorized*, and the whole project shares 2 messages an hour. Supabase returns
one error code for all of it, so [src/lib/auth-errors.ts](src/lib/auth-errors.ts)
separates the cases in the copy the shopper sees.

### Fixing it

1. Pick an SMTP provider — Resend, AWS SES, Postmark, SendGrid, Brevo,
   ZeptoMail all work. Verify your sending domain and set SPF, DKIM and DMARC,
   or your codes land in spam and the limit is the least of your problems.
2. Dashboard → **Authentication → SMTP**: tick *Enable Custom SMTP*, then host,
   port, username, password, and a `From` address such as
   `no-reply@ongod.in` with a sender name of `on god.`
3. Dashboard → **Authentication → Rate Limits**: the email limit is editable
   only once custom SMTP is on. Raise it from 30/hour to what you can afford —
   each message costs money and each one your provider flags costs you domain
   reputation.
4. Dashboard → **Authentication → URL Configuration**: allow the redirect URL
   that receives the code. The login page sends `emailRedirectTo` as
   `${origin}/account`, so allow `http://localhost:3000/account` now and your
   real domain when it exists.
5. Turn on **CAPTCHA** in the same Authentication settings. Bots signing up with
   other people's addresses is the standard way an email budget disappears, and
   Supabase's built-in hCaptcha/Turnstile stops it for free.

Send codes from a separate subdomain (`auth.` rather than the root) and keep
these messages free of marketing copy, taglines and emoji — a fashion label's
auth mail reads as marketing to every filter, and that is how a reputation dies.
`admin:password` deliberately avoids email altogether, which is why the Control
Room keeps working no matter what the hourly budget is doing.

### When it returns "Error sending magic link email" (HTTP 500)

That is the mailer failing, not a rate limit — a rate limit is a 429 with
`over_email_send_rate_limit`. A 500 means Supabase could not hand the message to
your SMTP server. Check **Authentication → Logs** for the entry with the
`error_id` from the response; it carries the underlying SMTP error. In order of
how often it is the cause:

| symptom in the log | cause | fix |
|---|---|---|
| `dial tcp` / `no such host` | host typo, or DNS blocked | copy the host from the provider verbatim |
| `connection refused` | **port 465** | use **587**. GoTrue speaks STARTTLS and does not support implicit TLS |
| `535` / `authentication failed` | wrong username shape | Resend: username `resend`, password = API key. SendGrid: username `apikey`, password = API key. Amazon SES: the SMTP credentials it generates, not your AWS keys |
| `550` / `from` rejected | sender not verified at the provider | the From domain must be verified (SPF + DKIM) with the provider itself |
| `554` / blocked or spam | content or reputation | check the provider's own logs, not Supabase's |

| `4xx` / delivered nowhere, no error | a **testing** sender | `onboarding@resend.dev` and Mailtrap's sandbox inbox only accept the account's own address. Sandbox hosts look healthy and silently swallow customer mail — use the sending product, on a verified domain |

Supabase stores the credentials in the project's auth config — there is
nothing to add to `.env`, and nothing in this repo reads SMTP.

Two settings are still worth acting on now that mail flows: the email rate limit
becomes editable only once custom SMTP is on (it defaults to 30/hour), and the
redirect allowlist still carries localhost rather than the real domain.

---

## Control Room

`/admin` — dashboard · `/admin/products` · `/admin/collections` ·
`/admin/inventory` · `/admin/orders` · `/admin/customers` · `/admin/media` ·
`/admin/settings`

Analytics is not a separate screen. It is the lower half of the dashboard:
recent orders and low stock on top, the traffic record below, because the
question an operator opens the Control Room with is one question, not two.

---

## Payments

Dormant by design. `src/lib/razorpay/` is a seam with no credentials behind
it. Orders are created with `payment_status = 'PENDING'` and stay that way
until a provider is configured and a real payment is captured.