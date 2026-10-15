# Plan: accounts complete, and the studio usable from any machine (2026-10-14)

Status: plan, waiting for approval. Build after approval; **do not commit** until the owner says so.
`tasks/plan.md` / `tasks/todo.md` (original v1 plan, 40 unchecked) and `tasks/login-plan.md` are left untouched;
this file is the plan and task list for this work.

## Goal
Anyone, on any computer or phone, opens the studio's web address, signs up, waits for the owner's approval, and
makes videos with their own API keys, seeing only their own stories and costs. The owner sees everything.

## Architecture decisions
- **Reachable over HTTPS through a tunnel from this Mac (recommended first step).** `cloudflared` (Cloudflare
  Tunnel, free) gives a public `https://…` address that forwards to `localhost:4000`. No router changes, no
  open ports, HTTPS for free, and rendering keeps using this Mac's ffmpeg, Chrome and HyperFrames.
  Trade-off: the studio is online only while this Mac is on and awake. A cloud server (Docker image with ffmpeg,
  Chrome, fonts) is a later option, listed under Phase 4, not built now.
- **The server stays bound to 127.0.0.1**; the tunnel is the only way in. Allowed host names become
  `localhost` plus `PUBLIC_HOST` (e.g. `studio.example.com`), so DNS-rebinding protection stays.
- **Cookies get `Secure` when the request came over HTTPS** (`PUBLIC_HOST` set), so passwords and sessions never
  travel in clear text.
- **Per-IP limits** on sign-up and sign-in (client IP from `CF-Connecting-IP`, trusted only when `PUBLIC_HOST` is
  set); the per-email lockout stays.
- **The owner's videos are private to the owner.** Editors never see, play, download or reuse them (lists, story
  pages, media, bulletins, posters), and neither do signed-out visitors. The intro's public showcase (built
  2026-10-14) changes to show only videos the owner marks **Show on the intro**, off by default (T1b); with none
  marked, the intro shows the template pictures and the intro film instead.
- **Stories belong to accounts** (`createdBy`). Old stories, bulletins and looks belong to the owner.
  Editors see only their own; the owner sees all.
- **"Edit in Studio" (HyperFrames preview) is owner-only and only on this Mac**: it opens a local preview server
  on port 3002 that remote visitors can't reach. Remote users get the change-in-words and versions instead.
- **One render queue stays shared** (renders are heavy); the story page shows its place in the queue.

## Dependency graph
```
T1 story ownership ──┬── T1b intro shows only chosen videos
                     ├── T2 per-account usage
                     ├── T3 bulletins/looks ownership
                     └── T8 queue position
T4 passwords (independent)
T5 public access (host, Secure cookie, IP limits, studio button) ── T6 tunnel + README ── T7 phone walkthrough
T9 voices, T10 re-render old videos, T11 backup (independent)
T12 translations (last: picks up all new text)
```

## Task list

### Phase 1: Accounts complete
- [x] **T1: Each account sees only its own stories** (built 2026-10-14, not committed) (`jobs.mjs`, `server.mjs`, `server.test.mjs`; M)
  - New stories, language siblings and format twins get `createdBy`; stories without it are the owner's.
  - Editors: list, story page, actions, photos, media, downloads, English check, studio → only their own (404
    otherwise). Owner: all.
  - Accept: test with owner + 2 editors; editor B gets 404 on A's story, media and actions; owner sees all three.
- [x] **T1b: The intro shows the owner's finished videos, watch only, each can be hidden** (built 2026-10-14, changed the same day from opt-in to shown-unless-hidden at the owner's request; not committed) (`jobs.mjs` `showcase`/`showcaseMedia`, `server.mjs`,
  `web/src/app.js`, `server.test.mjs`; S)
  - A **Show on the intro** switch on the owner's finished stories (off by default, so nothing is public until
    chosen). The showcase, its posters and finals only include those; everything else answers 401/404 to
    visitors and editors. Editors' own videos are never on the intro.
  - Accept: test: an unmarked finished video and its poster are refused to a visitor and to an editor; a marked
    one plays on the intro; the intro with none marked shows the templates and no broken pictures.
- [x] **T2: Usage per account** (built 2026-10-15: owner sees a per-account line under the month total) (`pipeline.mjs` `monthSpend`, `server.mjs`, `web/src/app.js`; S)
  - Editors see their own month and their own ElevenLabs credits; owner sees the total plus a per-account split.
  - Accept: test: two accounts' costs add up separately; owner's total equals the sum.
- [x] **T3: Bulletins and template looks have owners** (built 2026-10-15: bulletins already used only visible stories; approving/rejecting looks is now owner-only, 403 otherwise) (`server.mjs`, `designer.mjs`; S)
  - A bulletin may use only the maker's stories; editors see their own bulletins. Template looks: any account may
    design (with its own Gemini key); only the owner approves; approved looks are shared by all.
  - Accept: editor can't put another account's story in a bulletin (400); editor can't approve a look (403).
- [x] **T4: Change password, and owner reset** (built 2026-10-15; until a temporary password is changed, every other /api call answers 403) (`users.mjs`, `server.mjs`, `web/src/signin.js`, tests; S)
  - Account panel: change password (current + new). Owner: "Reset password" gives a one-time temporary password,
    which must be changed at the next sign-in.
  - Accept: old password stops working; temporary password forces a change; editors can't reset others.

### Checkpoint 1
- [ ] `npm test` passes (except i18n until T12); build clean; two-account walkthrough on a test server
      (port 4100, with a **copy** of `data/`, never the live one).

### Phase 2: From any machine
- [x] **T5: Safe to put online** (built 2026-10-14; quick tunnels allowed without config) (`auth.mjs`, `server.mjs`, `users.mjs`, `web/src/app.js`, tests; M)
  - `PUBLIC_HOST` added to allowed hosts; `Secure` cookies when set; per-IP limit (10 sign-ins / 5 sign-ups per
    15 min); security headers (`X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`).
  - "Edit in Studio" hidden and refused (403) unless owner on localhost.
  - Accept: tests for host allowlist, Secure flag, IP limit, studio refusal; localhost use unchanged.
- [x] **T6: The tunnel, set up and documented** (`npm run online`; checked over a real trycloudflare.com address) (`README.md`, `.env.example`, `package.json` script; S)
  - `npm run online`: starts `cloudflared` for port 4000 (quick tunnel with a random `trycloudflare.com` address,
    or a named tunnel on your own domain). README: install `brew install cloudflared`, set `PUBLIC_HOST`,
    keep the Mac awake (`caffeinate`).
  - Accept: the printed `https://` address opens the intro from another device.
- [ ] **T7: Walkthrough from a phone on mobile data** (manual)
  - Sign up → owner approves on the Mac → editor adds keys → files a story → sees it finish.
  - The editor can't find, play or download any of the owner's videos, including by pasting a video link.

### Checkpoint 2
- [ ] All of the above works over the public address; owner reviews.

### Phase 3: Nice to have
- [x] **T8: Place in the render queue** (built 2026-10-15) shown on a queued story ("2 stories ahead of yours") (`server.mjs`, `app.js`; S)
- [x] **T9: Editors pick their own voices** (built 2026-10-15 as a voice ID box per language in Account › Voices; no dropdown from the library yet) per language from their ElevenLabs library (`users.mjs`, `pipeline.mjs`, `signin.js`; S)
- [x] **T10: Re-render the 11 old videos** (checked 2026-10-15: not needed. All 16 finished videos, including older versions, and the 4 drafts already show DASHA | VANI) with the Dashavani logo (one-off, owner's queue, render time only; S)
- [x] **T11: `npm run backup`** (built 2026-10-15: zips to ../dashavani-backups/): dated zip of `data/` (accounts, jobs, finals) outside the repo (S)
- [ ] **T12: Translations** of all interface text, including everything new above (`npm run i18n`; S)
  - Accept: the i18n test passes, so the full suite is green.

### Checkpoint 3
- [ ] Full `npm test` green, build clean, owner review. **No commit until the owner says so.**

## Phase 4 (later, not in this build): always online without this Mac
A Docker image (Node 22, ffmpeg, Chromium, the fonts) on a small cloud server with a volume for `data/`.
Renders need ~2 GB RAM; a 4 GB server is about US$ 20–25/month.

## Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Studio offline when the Mac sleeps | Med | `caffeinate` in `npm run online`; Phase 4 if it must be always on |
| Many people share one render queue | Med | T8 shows the wait; renders stay one at a time to protect the Mac |
| Public sign-up spam | Med | Owner approval + per-IP limit (T5) |
| Editors see each other's work before T1 | High | Do T1 before going online (T5–T6) |
| A test run touching live `data/` | High | Test servers use a temp copy of `data/` (`DATA_DIR`) |

## Open questions
1. Tunnel from this Mac (free, Mac must stay on) — or go straight to a cloud server (Phase 4, paid)?
2. Quick tunnel (new random address each start) or your own domain (fixed address, needs a domain on Cloudflare)?
