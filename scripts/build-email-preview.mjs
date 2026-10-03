#!/usr/bin/env node
/**
 * Build supabase/email-templates/preview.html.
 *
 * Each template is a complete HTML document, so the preview cannot just stack
 * the bodies — they would collide over each other. Instead every template is
 * inlined into an iframe's `srcdoc`, which renders it exactly as a mail client
 * would: real viewport, real media, no interference from the preview page.
 *
 * Placeholders are NOT substituted. `{{ .Token }}` shows as `{{ .Token }}`, so
 * what you see on screen is what Supabase will see when it sends, before it
 * fills anything in. The Magic Link template is previewed twice, once per arm
 * of its `{{ if .Token }}` branch, because the two arms are two different
 * emails and only one of them ever arrives at a time.
 *
 *   node scripts/build-email-preview.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "email-templates");

/** Dashboard order, subject lines, and the note shown above each frame. */
const SPECS = [
  {
    file: "magic-link-otp.html",
    name: "Magic link or OTP",
    dashboard: "Authentication → Templates → Magic link or OTP",
    subject: "Your on god. code",
    note: "The only template this application actually sends. Customers at /account/login and operators at /admin/login both request a six-digit code.",
    variants: [
      { label: "if .Token — Email OTP length = 6 (what you get today)", keep: "if" },
      { label: "else — magic link (if the OTP length is ever cleared)", keep: "else" },
    ],
  },
  {
    file: "confirm-signup.html",
    name: "Confirm sign up",
    dashboard: "Authentication → Templates → Confirm sign up",
    subject: "Confirm your address",
    note: "No sign-up form exists in this project — signInWithOtp mints customers on first use. Kept consistent for the unexposed path.",
  },
  {
    file: "invite-user.html",
    name: "Invite user",
    dashboard: "Authentication → Templates → Invite user",
    subject: "Your invitation",
    note: "Operator onboarding. The grant itself is written by npm run admin:grant, never by this link.",
  },
  {
    file: "change-email.html",
    name: "Change email address",
    dashboard: "Authentication → Templates → Change email address",
    subject: "Confirm the change",
    note: "Shows both addresses: {{ .Email }} struck through above {{ .NewEmail }}.",
  },
  {
    file: "reset-password.html",
    name: "Reset password",
    dashboard: "Authentication → Templates → Reset password",
    subject: "Reset your password",
    note: "Nobody signs in with a password. Supabase's recover flow still needs a body that does not look borrowed.",
  },
  {
    file: "reauthentication.html",
    name: "Reauthentication",
    dashboard: "Authentication → Templates → Reauthentication",
    subject: "Confirm it is you",
    note: "The most sensitive of the six: a working link here is proof of identity, so the copy says so plainly.",
  },
];

/** Escape a document for use as an HTML attribute value. */
function attr(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CONDITIONAL = /^\{\{\s*if \.Token\s*\}\}$/;
const ALTERNATE = /^\{\{\s*else\s*\}\}$/;
const END = /^\{\{\s*end\s*\}\}$/;

/**
 * Resolve `{{ if .Token }} … {{ else }} … {{ end }}` down to one arm.
 * Markers are whole lines, so line filtering is exact — nothing else is
 * touched, so a stray `{{` inside copy could never be misread as a branch.
 */
function selectArm(source, keep) {
  const lines = source.split("\n");
  const out = [];
  let arm = "if";
  let armed = false;

  for (const line of lines) {
    if (!armed && CONDITIONAL.test(line.trim())) {
      armed = true;
      arm = "if";
      continue;
    }
    if (armed && ALTERNATE.test(line.trim())) {
      arm = "else";
      continue;
    }
    if (armed && END.test(line.trim())) {
      armed = false;
      continue;
    }
    if (armed && arm !== keep) continue;
    out.push(line);
  }
  return out.join("\n");
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sections = [];

for (const spec of SPECS) {
  const source = readFileSync(join(dir, spec.file), "utf8");
  const variants = spec.variants ?? [{ label: null, keep: null }];

  const frames = variants
    .map((variant) => {
      const doc = variant.keep ? selectArm(source, variant.keep) : source;
      const label = variant.label
        ? `<div style="font:10px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0.32em;text-transform:uppercase;color:#7F1518;padding:0 0 10px;">${esc(variant.label)}</div>`
        : "";
      return `<div class="frame">
${label}
<div class="frame-slot"><div class="frame-box"><iframe title="${esc(spec.name)}" srcdoc="${attr(doc)}" sandbox="allow-same-origin" scrolling="no"></iframe></div></div>
</div>`;
    })
    .join("\n");

  sections.push(`<section style="padding:40px 0 48px;border-top:1px solid rgba(216,209,197,0.12);">
  <div style="font:10px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0.32em;text-transform:uppercase;color:#6E6A5F;">${esc(spec.dashboard)}</div>
  <h2 style="margin:12px 0 0;font:400 30px/1.2 Georgia,'Times New Roman',serif;color:#D8D1C5;">${esc(spec.name)}</h2>
  <div style="margin-top:14px;display:inline-block;padding:8px 14px;background:#131210;border:1px solid #2F2D29;border-radius:2px;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0.1em;color:#D8D1C5;">Subject: ${esc(spec.subject)}</div>
  <p style="margin:16px 0 0;max-width:620px;font:14px/1.75 Georgia,'Times New Roman',serif;color:#98938A;">${esc(spec.note)}</p>
  <div style="margin-top:8px;font:10px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#44423D;">File: supabase/email-templates/${esc(spec.file)}</div>
  <div style="margin-top:28px;">
${frames}
  </div>
</section>`);
}

const missing = readdirSync(dir)
  .filter((f) => f.endsWith(".html") && f !== "preview.html")
  .filter((f) => !SPECS.some((s) => s.file === f));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>on god. — auth email templates</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; padding:0; background:#0D0C0A; color:#D8D1C5; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:700px; margin:0 auto; padding:56px 20px 80px; }
  a { color:#D8D1C5; }
  code { font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; color:#98938A; }
  /* Mail width is 600px plus the 16px gutters the templates set, so the frame
     is laid out at a true 632px and only ever scaled *down* — never up, which
     would lie about how large the type looks in an inbox. */
  .frame { padding:0 0 28px; }
  /* The scaled frame is still 632px of layout width, so the slot clips it —
     otherwise the whole page grows a horizontal scrollbar on a narrow panel. */
  .frame-slot { width:100%; overflow:hidden; }
  .frame-box { width:632px; height:1180px; transform-origin:top left; overflow:hidden; }
  .frame-box iframe { display:block; width:632px; height:100%; border:1px solid #272522; border-radius:2px; background:#0D0C0A; }
</style>
</head>
<body>
<div class="wrap">
  <div style="font:12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0.32em;text-transform:uppercase;color:#D8D1C5;">ON GOD.</div>
  <table style="margin-top:22px;border-collapse:collapse;"><tr><td height="2" bgcolor="#7F1518" style="height:2px;line-height:2px;font-size:0;width:54px;">&nbsp;</td></tr></table>
  <h1 style="margin:28px 0 0;font:400 34px/1.2 Georgia,'Times New Roman',serif;color:#D8D1C5;">Auth email templates.</h1>
  <p style="margin:16px 0 0;max-width:620px;font:15px/1.8 Georgia,'Times New Roman',serif;color:#98938A;">Every body Supabase sends for this project, in the archive's own ink. Each frame below is the real template rendered by a browser at mail width — placeholders are shown as written (<code>{{ .Token }}</code>, <code>{{ .ConfirmationURL }}</code>) rather than filled in, so what you approve here is what Supabase will substitute into.</p>
  <p style="margin:20px 0 0;max-width:620px;font:11px/2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0.1em;color:#6E6A5F;">PASTE EACH BODY INTO AUTHENTICATION → TEMPLATES. SUBJECT LINES ARE LISTED WITH EACH TEMPLATE ABOVE.</p>
${missing.length ? `<p style="margin:20px 0 0;font:11px/1.8 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#7F1518;">Unlisted in preview.html: ${esc(missing.join(", "))}</p>` : ""}
${sections.join("\n")}
</div>
<script>
/**
 * Size each frame to its own content, then scale it to whatever the panel is.
 * The card is a fixed 600px table; in a narrow panel it would clip rather than
 * shrink, which is exactly the bug this avoids — the reader always sees the
 * whole template, at a legible-enough ratio to judge the design.
 */
(function () {
  var WIDTH = 632;
  var frames = [].slice.call(document.querySelectorAll(".frame-box"));
  var page = document.querySelector(".wrap");

  function fit(box) {
    var f = box.firstChild;
    var h = 200;
    // Collapse first, measure second. A framed document stretches to its box,
    // so measuring first just reads the height this function already set —
    // every frame would come back identical and clip its own footer.
    box.style.height = "1px";
    try {
      var d = f.contentDocument;
      h = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight, 1);
    } catch (e) { /* sandboxed: leave the default */ }
    // Scaled against .wrap, never against the frame's own slot — writing a
    // width back into the thing just measured collapses it to zero, permanently.
    var scale = Math.min(1, page.clientWidth / WIDTH);
    box.style.height = h + "px";
    box.style.transform = scale === 1 ? "none" : "scale(" + scale + ")";
    box.parentNode.style.height = h * scale + "px";
  }

  frames.forEach(function (box) {
    var f = box.firstChild;
    if (f.contentDocument && f.contentDocument.readyState !== "loading") fit(box);
    f.addEventListener("load", function () { fit(box); });
  });

  var t;
  addEventListener("resize", function () {
    clearTimeout(t);
    t = setTimeout(function () { frames.forEach(fit); }, 120);
  });
})();
</script>
</body>
</html>
`;

writeFileSync(join(dir, "preview.html"), html);
console.log(`preview.html — ${SPECS.length} templates, ${SPECS.reduce((n, s) => n + (s.variants?.length ?? 1), 0)} frames`);