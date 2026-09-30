# Yearling Sale Tool

Login-gated tool for managing a sale roster, in-sale updates, sale-day
results, and submitting the aggregate data to Equiline as XML. Also exposes
a small unauthenticated JSON feed of sale results (last 5 / 10 / 25 / all)
for overlays or a website.

Data is stored as flat JSON files under `/data` (atomic writes — no
database server to run or manage). Good enough for one sale team working
from one droplet; if you ever need multiple people hitting it concurrently
at real volume, that's the thing to revisit first.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set SESSION_SECRET, ADMIN_USER/ADMIN_PASS, and the EQUILINE_* vars
npm start
```

Visit `http://localhost:3000` (or whatever `PORT` you set). Log in with
`ADMIN_USER` / `ADMIN_PASS` — that account is created automatically the
first time the server runs (only if `data/users.json` doesn't exist yet).
Change the password from the app once you're in (there's a
`POST /api/auth/change-password` endpoint; a UI button for it isn't wired
up yet — easy to add if you want it in the header).

## The three panels

**1. Load Roster** — paste/upload a CSV with the header
`hip_no,yearling_name,sire,dam,consignor,video_url,trackit_url,pedigree_url`,
or add/edit one yearling at a time. Re-loading a CSV is safe to do more than
once — rows are matched and updated by `hip_no`, never duplicated. The
roster table has a search box, a sex filter, and a "hide withdrawn" toggle
above it, with a live count of how many hips are shown — the same shape of
filtering as a public sale-roster page, just scoped to this admin view.
Video/Trackit/Pedigree links show inline per hip when present.

Click **Edit** on any row to load that hip's full details — including its
video/Trackit/pedigree links — back into the manual entry form below, make
changes, and save. Editing tracks the hip by its internal record, not by
hip number, so you can correct a hip number itself without creating a
duplicate row.

The official Equineline catalog export (the one with columns like
`sale_id, hip_number, horse_name, sire_name, dam_name, consignor_name,
sex, gait, session_id, ...`) is auto-detected and mapped automatically —
just upload that file as-is, no reformatting needed. `sex` and `gait` come
along for the ride and show up in the roster table (they're not part of
the Equiline submission schema, just useful context). Video/Trackit/
pedigree URLs aren't in that export, so those stay blank until added
manually or via a follow-up CSV that includes them. If the file has a
single consistent `sale_id`, the app reports it back after loading so you
can copy it into the Submit panel's Sale ID field.

One thing worth knowing: Excel's "CSV" export on Windows is often saved as
Windows-1252, not UTF-8 — that shows up as mangled apostrophes/quotes in
names (e.g. `’`) if read wrong. The file-upload path in the browser tries
UTF-8 first and falls back to Windows-1252 automatically, so accented
names and curly quotes come through correctly either way. This only
applies to the **file upload** button — pasting into the textarea is
already plain-text by the time it hits the browser, so there's nothing to
detect there.

**2. Updates** — **Bulk load updates (CSV)** at the top takes Equiline's
per-hip content file (header
`sale_company,sale_company_key,sale_id,hip_number,sequence,content_type,content,content_label`).
Load it after the roster. LINK and UPDATE rows go into the content store in
the file's own sequence; RESULT / WITHDRAWN rows mark those hips out as
withdrawn; blank Sale Company / Key / Sale ID fields are filled from the
file. Each load replaces the previous bulk load wholesale (the file is the
full picture), and updates added by hand are kept. That same file loaded on
the Load Roster panel is rejected, so it can never touch roster names.

Below that, free-text updates per hip (race form, notes, whatever you'd
normally send Equiline as an `UPDATE` line). "Mark Out" moves a yearling to
the Outs list and is reversible ("Reinstate") if it was a mistake.

**3. Sale Day** — as each hip goes through the ring, set its status
(sold / RNA / withdrawn) and, if sold, the price and buyer.

**Submit to Equiline** — enter your Sale Company / Sale Company Key / Sale
ID once (Equiline assigns the Sale ID per sale), then Preview or Submit.
Submitting always sends the **full aggregate** of every hip's updates,
results, and links — never just what changed since the last send — because
that's explicitly what Equiline's service expects.

## Equiline XML

`src/services/xmlBuilder.js` builds the `<SaleUpdates>` document. A couple
of things worth knowing if you ever need to adjust it:

- It replicates Equiline's own sample exactly, including embedding raw
  `<b>`/`<br>` HTML unescaped inside the `Text="..."` attribute. That's not
  strictly valid XML, but it's what their sample shows and what their
  parser expects, so this doesn't "fix" it.
- `RESULT` lines are derived automatically from each hip's sale status —
  you don't enter them as raw text. `sold` → `"$10,000<br>Buyer Name"`,
  `rna` → `"RNA"`, `withdrawn` → `"Withdrawn"`.
- `Sequence` is assigned per hip, in the order: UPDATEs (oldest first),
  then the derived RESULT (if any), then LINKs.

`src/services/equilineClient.js` is the part that actually talks to
Equiline. The spec Equiline sent doesn't include a real endpoint URL or
auth flow — just that they'll provide one once you're set up to test — so
this is written generically: it optionally logs in (skipped entirely if
`EQUILINE_LOGIN_URL` is blank) and then POSTs the XML to
`EQUILINE_SUBMIT_URL`. Once Equiline gives you the real URLs/credentials,
they go in `.env` and nothing in the code needs to change. If their actual
auth turns out to look different (e.g. an API key header instead of a
login call), that's a small, isolated edit to `equilineClient.js` only.

Every submission attempt (success or failure) is logged to
`data/submissions.json` (last 100 kept) and shown in the Submission History
table.

## Public results feed

No login required:

```
GET /api/public/results/last5
GET /api/public/results/last10
GET /api/public/results/last25
GET /api/public/results/all
GET /api/public/results?limit=10
```

Each returns `{ count, total, results: [...] }`, most recent first. Only
resolved hips (sold / RNA / withdrawn) ever show up here — pending hips and
anything from the login-only admin panels never leak into this feed.

## Deploying

Nothing here is tied to any particular host — plain Node + a couple of npm
packages, no native modules or build step. On a droplet: `npm install`,
set up `.env`, then run it under `pm2` or a systemd unit so it restarts on
crash/reboot, and put it behind Caddy/nginx for TLS (the session cookie is
already `httpOnly`; flip on `cookie.secure` in `server.js` once it's behind
HTTPS).
