# Plan: the 20-point security check (2026-10-15)

Status: built and committed 2026-10-15 (approved: 20 stories a day, sign out everywhere). Since then API keys live
only on the server, so `MONTHLY_CAP_INR` counts the whole studio. This file is both plan and task list for this work.

## Overview
Dashavani Studio was checked against a 20-point list for apps that go online. Most points already hold.
This plan fixes the gaps and adds tests that prove the rest, so a later change can't quietly undo them.

## Audit: where each point stands

| # | Check | Now | Evidence / gap |
|---|-------|-----|----------------|
| 1 | Secret API keys on the server | ✅ | Keys stay in `.env.local` / `users.json` (AES-GCM). The page only gets key *names*; Gemini key goes in a header, not the URL |
| 2 | `.env` files private | ⚠️ | Not in git (`.gitignore`), but `.env.local` is mode 644 (other Mac users can read it) → S1 |
| 3 | Git history scanned for secrets | ⚠️ | A pattern search of all 54 commits (public `main` + local `history-backup`), `story.md` and `cloude.md` found no keys. No real scanner run yet → S1 |
| 4 | Rotate exposed keys | ✅ (none found) | Rotate only if S1's scanner finds something |
| 5 | Authorize every request | ✅ | Every route except the open list (`auth.mjs isOpen`) needs a signed session; route-level test missing → S6 |
| 6 | IDs, roles, prices checked by the server | ✅ | IDs checked against a pattern, role read from `users.json`, costs worked out on the server from `RATES`; no price comes from the browser |
| 7 | Each user's data separate | ✅ | `visibleTo` on jobs, media, bulletins, usage; tested at function level only → S6 |
| 8 | Database and storage locked down | ✅ | `data/` is never served directly; media paths checked by pattern; `users.json` and `session-secret` are 600; server binds to 127.0.0.1 |
| 9 | Admin actions protected | ✅ | Approve/remove/reset accounts and approve looks are owner-only (403); Studio is owner-on-this-Mac only → covered in S6 |
| 10 | Test login, logout, password reset | ⚠️ | Unit tests only. **Sign out only deletes the cookie**: a copied cookie keeps working for up to 12 h → S5, S7 |
| 11 | Rate-limit login and API calls | ⚠️ | Sign-in, sign-up, forgot and reset are limited (20 per 15 min per address, plus 5-try lock per email). Other API calls have no limit → S3 |
| 12 | Cap AI use and spending | ❌ | Script length is capped, but there is no cap on stories per day or ₹ per month. Editors pay with their own keys, but they all share this Mac's one render queue → S2 |
| 13 | Check inputs on the server | ✅ | JSON only, 1 MB body cap, zod for scripts, every field checked in `server.mjs` |
| 14 | Database queries with parameters | n/a | There's no SQL; data is JSON files with IDs checked by pattern |
| 15 | Escape user content | ✅ / ⚠️ | Every `innerHTML` with user text goes through `esc()`; template values are JSON-encoded. There's no Content-Security-Policy as a second guard → S4 |
| 16 | Limit upload types and sizes | ⚠️ | Size caps (8 MB photo, 100 MB clip) and type list exist, but the type is taken from the `Content-Type` header, not the file's actual bytes → S8 |
| 17 | Verify payments on the server | n/a | No payments |
| 18 | No debug output, no secrets in logs | ⚠️ | Logs carry error messages only, no keys or headers. But an unexpected error (500) sends its raw message to the browser, which can include file paths → S9 |
| 19 | Test that a backup restores | ❌ | `npm run backup` exists; a restore has never been tried → S10 |
| 20 | Test access across accounts and when signed out | ⚠️ | Function-level tests plus a manual curl check; no automatic route test → S6 |

## Architecture decisions
- **One HTTP access test drives the real server** (`server.mjs` on a free port with a temp `DATA_DIR`, `--mock`)
  instead of more function tests: it's the only kind that catches a new route someone forgets to protect.
- **Sign-out ends the session on the server** by adding a per-account `session` counter to the cookie signature,
  the same trick the password hash already uses. Nothing extra stored per sign-in.
- **Caps live in `.env.local`** (`DAILY_STORIES`, default 20 per editor; `MONTHLY_CAP_INR`, owner's, default off)
  and are checked when a story is filed, not partway through the paid steps.
- **CSP without `unsafe-inline` scripts**: the one inline theme script in `index.html` moves into a file.

## Dependency graph
```
S1 secrets scan + .env mode (independent)
S6 HTTP access test harness ──┬── S7 login/logout/reset test ── S5 server-side sign-out
                              ├── S3 API rate limit
                              ├── S2 caps
                              └── S9 generic 500s
S4 CSP (independent, browser check)
S8 upload bytes check (independent)
S10 backup restore (independent)
```

## Task list

### Phase 1: Secrets
- [x] **S1: Secrets scan and `.env.local` permissions** (built: gitleaks: 1 false alarm in history (the "Key Points" template), only `.env.local` itself in the folder; nothing to rotate. Server warns at start if `.env.local` is readable by others) (XS; `.env.local`, `README.md`)
  - `chmod 600 .env.local`; run `gitleaks` (via `brew install gitleaks`) over `main`, `history-backup`, the working
    tree and `story.md`/`cloude.md`; README tells you to keep `.env.local` at 600.
  - Accept: gitleaks shows 0 findings (any finding: rotate that key at the provider before anything else).
  - Verify: `stat -f %Lp .env.local` = 600; gitleaks output saved in the task notes.

### Phase 2: Prove access rules
- [x] **S6: HTTP access test: every route as owner, editor A, editor B and signed out** (built: `access.test.mjs`) (M; `access.test.mjs`)
  - Starts the server (`--mock`, temp `DATA_DIR`, port 0), makes an owner, two approved editors, a story each, and
    a bulletin each.
  - A table of routes × callers → expected status: B gets 404 on A's story, poster, final, download, subtitles,
    photos, voice, actions and bulletin; signed-out gets 401 on everything except the open list (and only marked
    intro media); editors get 403 on `/api/users*`, look approval and Studio.
  - Accept: the test lists every route in `route()`; adding a route without a row fails the test.
  - Verify: `npm test`.
- [x] **S7: Login, logout and reset over HTTP** (built: `access.test.mjs`) (S; `access.test.mjs`)
  - Sign in sets an HttpOnly, SameSite cookie; wrong password returns 401 after the delay; reset link works once;
    old cookie dies after reset/change password; temporary password blocks other API calls until changed.
  - Accept: all pass; **logout check fails until S5** (written first, red).
- [x] **S5: Sign out ends the session on the server** (built: per-account `session` counter in the cookie key) (S; `users.mjs`, `auth.mjs`, `server.mjs`)
  - Logout bumps the account's `session` counter, which goes into the cookie signature; all of that account's
    cookies stop working (sign out everywhere).
  - Accept: S7's logout check passes; a copied cookie gets 401 after sign out.

### Checkpoint 1
- [x] `npm test` green (except i18n, see below), `npm run build` clean, the test server (port 4100, a copy of `data/`) works by hand.

### Phase 3: Limits
- [x] **S3: Rate limit on signed-in API calls** (built) (XS; `server.mjs`)
  - Using the existing `rateLimit`: 120 POST/DELETE per minute per account → 429. Reads aren't limited (the page
    polls them).
  - Accept: S6 adds a case: request 121 in a minute gets 429, and so does that account's next one; another account is unaffected.
- [x] **S2: Caps on stories and spend** (built: `overCap` in `jobs.mjs`; other-format twins count as stories) (S; `server.mjs`, `pipeline.mjs` `monthSpend`, `.env.example`)
  - New story refused (429, plain message) when an editor has filed `DAILY_STORIES` today (IST), or the owner's
    month total ≥ `MONTHLY_CAP_INR` (when set). Re-renders count only against the queue rule, not the cap.
  - Accept: test: story 21 of the day is refused for an editor; the owner over the cap is refused; under it, works.
- [x] **S9: Unexpected errors don't leak details** (built) (XS; `server.mjs`)
  - A 500 sends "Something went wrong; try again" and logs the real error; 4xx messages stay as they are.
  - Accept: S6 case forcing a 500 gets the generic text.

### Checkpoint 2
- [x] `npm test` green; filing checked by the access test (mock). Re-rendering and bulletins not re-checked by hand.

### Phase 4: Content
- [x] **S8: Uploads checked by their bytes** (built: also removes half-written clip files) (XS; `pipeline.mjs` `savePhoto`, `pipeline.test.mjs`)
  - JPEG/PNG/WebP must start with their magic bytes; clips must be readable by `ffprobe` as video (already run),
    else rejected and the file deleted.
  - Accept: test: an HTML file sent as `image/jpeg` is refused with no file left behind.
- [x] **S4: Content-Security-Policy** (built: checked in headless Chrome on a copy of data/: intro, login, sign-up, home, a story (video playing, account panel), bulletins; no CSP errors; light theme still applies) (S; `server.mjs`, `web/index.html`, new `web/src/theme.js`)
  - `default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline';
    script-src 'self'; frame-ancestors 'none'`; the inline theme script moves to a file.
  - Accept: home, story page, intro, login, account panel, and the video players all load with **no CSP errors in
    the console**; checked in Chrome on the test server.

### Phase 5: Recovery
- [x] **S10: Backup restore, tried for real** (built: 523 MB zip restored to a temp folder: same files, 20 stories, 2 accounts, owner sign-in and final video work. Backups are now readable only by you) (S; `package.json`, `README.md`)
  - `npm run backup`, unzip into a temp folder, start a test server on it (port 4100, `DATA_DIR`), sign in as the
    owner, open a finished story and play its final. README gets the 3-line restore steps.
  - Accept: done once by hand, steps written down; the zip holds `users.json`, `session-secret`, `jobs/`, finals.

### Checkpoint 3
- [x] Full `npm test` green, build clean, audit gaps fixed. Owner review; committed 2026-10-15.

## Risks and mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| CSP blocks something the page needs (fonts, blob video, HyperFrames preview) | Med | Browser check of every page in S4; Studio preview runs on its own port, not affected |
| S5 signs out the owner's open tabs once on rollout | Low | Expected, one-time; say so in the README |
| A cap stops real work mid-day | Low | Plain message naming the setting; owner raises it in `.env.local` |
| Access test misses a route added later | Med | S6 fails when `route()` gains a path with no row in the table |
| Tests touching live `data/` | High | Temp `DATA_DIR` only; never the live folder |

## Open questions
1. Caps: is 20 stories per editor per day right, and do you want a monthly ₹ cap on your own keys (what amount)?
2. Sign out: end every session for that account (simple, planned), or only the one browser (needs a stored list)?
