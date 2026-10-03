# Auth email templates

Six bodies for the six templates Supabase Auth sends, written in the archive's
own ink so the mail a customer opens looks like the site they clicked from.

| File | Dashboard → Authentication → Templates | Subject |
| --- | --- | --- |
| `magic-link-otp.html` | **Magic link or OTP** | `Your on god. code` |
| `confirm-signup.html` | **Confirm sign up** | `Confirm your address` |
| `invite-user.html` | **Invite user** | `Your invitation` |
| `change-email.html` | **Change email address** | `Confirm the change` |
| `reset-password.html` | **Reset password** | `Reset your password` |
| `reauthentication.html` | **Reauthentication** | `Confirm it is you` |

Only **Magic link or OTP** is live. `/account/login` and `/admin/login` both
call `signInWithOtp`, and with Email OTP length set to 6 that template sends the
code panel. The other five exist so no path of Supabase's Auth mail ever falls
back to the default grey template.

## Paste them in

There is no API for template bodies — the dashboard is the only door, and
nothing in this repo can do it for you.

1. Open **Authentication → Templates**.
2. Click the template you are pasting (the names in the table above are the
   dashboard's own).
3. Clear the body editor completely, then paste the *whole* file — from
   `<!DOCTYPE html>` to `</html>`. The editor is plain text; a partial paste
   loses the `<head>`, and Outlook needs the `<meta name="color-scheme">`.
4. Set the subject to the value in the table. The subject field accepts
   placeholders too, but none of these need one.
5. **Save**.

Do all six in one sitting so the mail is consistent while the code is live.

## After pasting, in the same dashboard

- **Email OTP length must stay `6`.** At `0` Supabase sends a magic link and
  the login page — which only accepts six digits — will never accept it. This
  is the exact failure that shipped once already.
- **Add the site URL and `/auth/callback` to the redirect allowlist.** Every
  emailed link lands there, it reads `?code=`, `?token_hash=` or
  `#access_token=` and is the only place a session cookie is written. Without
  it, localhost works and production does not.
- **Rate limits** — the hourly email cap defaults to 30. Both login pages make
  every sign-in an email, so that budget goes quickly.

## Design notes

Everything is inline CSS. Mail clients strip `<style>` blocks, so a stylesheet
that works on the site produces an unstyled email here; the rules that matter
are written on the elements themselves.

Fonts are system stacks — `Georgia` for the serif display and
`SFMono-Regular, Menlo, Consolas, 'Courier New'` for the mono. The site's real
faces (Cormorant, JetBrains Mono, UnifrakturMaguntia) are `next/font` webfonts
and cannot load in mail. Because Unifraktur is unavailable, the wordmark is set
as tracked mono capitals, `ON GOD.`, at `0.32em` — the archive's
`tracking-archive`, which is the same shape the footer and every
`ArchiveLabel` uses.

Colours come straight from `tailwind.config.ts` and nowhere else:

| Role | Token | Value |
| --- | --- | --- |
| Page ground | `abyss` | `#0D0C0A` |
| Card | `void` | `#131210` |
| Primary ink | `bone` | `#D8D1C5` |
| Secondary ink | `bone-dim` | `#98938A` |
| Tertiary ink | `bone-faint` | `#6E6A5F` |
| Rule / button | `crimson` | `#7F1518` |
| Button border | `crimson-bright` | `#9c2024` |

There is no marketing tagline in these bodies. Supabase's guidance is explicit
that auth mail carrying brand copy reads as marketing and gets filtered;
"NOT JUST CLOTHING. A WAY OF BEING." is one line in each file if you disagree.

The preheader — the grey line the inbox shows above the subject — is the hidden
div at the top of each file. It says what the mail is, because the subject line
is doing very little work here.

`magic-link-otp.html` wraps its code panel in
`{{ if .Token }} … {{ else }} … {{ end }}`, so if the OTP length is ever cleared
the same template still sends a usable link instead of an empty box.

## preview.html

Generated, not hand-edited:

```bash
npm run email:preview      # rewrites preview.html from the six templates
```

It inlines every template as an iframe `srcdoc` at mail width and substitutes
**nothing** — `{{ .Token }}` displays as `{{ .Token }}`. That is deliberate: the
preview should show the body Supabase will parse, not a fiction of a delivered
message. The Magic Link template renders twice, once per arm of its conditional.

The frames cannot scroll themselves to fit (`scrolling="no"`, fixed height), so
a changed template may need the heights in `scripts/build-email-preview.mjs`
bumped.

## Judging the result

Rendering in a browser is not rendering in Gmail. The only honest test is a
live send: request a code from `/account/login`, then check in the inbox that
the dark card survives, that the six-digit code is legible, that the button
survives on mobile, and that the sender name and SPF/DKIM pass. Anything that
looks broken in Mailtrap's inbox is worth fixing before the next shopper sees
it — the login page is the front door.