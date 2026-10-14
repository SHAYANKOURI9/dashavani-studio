# Plan: accounts for Dashavani Studio (sign up, then sign in)

Status: built 2026-10-14 (Tasks 1-7, 9). Answers: owner approval; finished videos need sign-in; intro still first.
Added: only the owner uses the .env.local API keys; every other account saves its own under Account (encrypted).
Not done: Task 8 (translations of the new text; it shows in English until `npm run i18n` runs).

## What we're building
A new person signs up with email and password. After that they sign in. Every feature (the studio, filing, stories,
videos, bulletins, templates, usage) needs a signed-in account. Only the intro, the sign-in page and the sign-up page
are open to everyone.

## Decisions
- **Users live in `data/users.json`** (same style as the job files, no database). Each user: id, email (lowercased,
  unique), password hash, role, createdAt.
- **Passwords are hashed with `scrypt` from `node:crypto`** with a random salt per user. No new dependency.
  Minimum 8 characters.
- **Sessions reuse the signed-cookie design in `auth.mjs`**: `dv_session=<userId>.<expiry>.<signature>`, HttpOnly,
  SameSite=Lax, 12 hours. The signing key is `SESSION_SECRET` in `.env.local` (made on first start if missing).
  `STUDIO_PASSWORD` goes away.
- **Gate everything, not just actions:** any page or `/api/*` or `/media/*` request without a valid session goes to
  `/login?next=…` (pages) or gets a 401 (API). Open: `/intro`, `/login`, `/signup`, `/api/login`, `/api/signup`,
  fonts, the favicon and the built assets the open pages need.
- **Who may sign up (needs your answer, see Open questions).** Recommended: the first account becomes the owner;
  later sign-ups wait as "pending" until the owner approves them. Open sign-up on its own would let anyone who reaches
  the studio spend ElevenLabs, Gemini and HeyGen money.
- **Wrong passwords:** 1 second wait on every failure, and 5 failures for one email lock it for 15 minutes.
  Same error text for "no such email" and "wrong password" so emails can't be guessed.

## Tasks

### Phase 1: Accounts on the server
- [ ] **Task 1: User store and password hashing** (`users.mjs`, `users.test.mjs`; S)
  - Create a user, find by email, check a password, refuse a duplicate email, first user is owner.
  - Check: tests pass; `data/users.json` never holds a plain password.
- [ ] **Task 2: Per-user sessions** (`auth.mjs`, `auth.test.mjs`, `login.test.mjs`; S)
  - Token names the user; expired, tampered or deleted-user tokens are rejected.
  - Check: tests pass.
- [ ] **Task 3: Sign-up, sign-in, sign-out and the gate** (`server.mjs`, `server.test.mjs`; M)
  - `POST /api/signup`, `POST /api/login`, `POST /api/logout`, `GET /api/me`.
  - Every non-open request needs a session; pages redirect to `/login?next=`, API answers 401.
  - Lockout after 5 wrong tries.
  - Check: `curl` without a cookie gets 302/401 on `/`, `/api/jobs`, `/media/...`; with a cookie it works.

### Checkpoint 1
- [ ] All tests pass; a fresh `data/` lets the first sign-up in as owner.

### Phase 2: Pages
- [ ] **Task 4: Sign-up page** (`web/signup.html`, `web/src/signup.js`, `web/vite.config.ts`; M)
  - Email, password, confirm password, show/hide, inline errors under each field, link to sign in.
  - Reuses the look of the existing `login.html`.
  - Check: works with keyboard only and at 360px wide.
- [ ] **Task 5: Sign-in page with email** (`web/login.html`, `web/src/login.js`; S)
  - Adds the email field and a "New here? Create an account" link; returns to `next` after sign-in.
- [ ] **Task 6: Signed-in studio** (`web/src/signin.js`, `web/src/app.js`, `web/index.html`; S)
  - Top bar shows the account email and Sign out. An expired session mid-work opens the sign-in box
    (the existing dialog, with email added) so nothing typed is lost.

### Checkpoint 2
- [ ] New person: intro → sign up → studio → file a story → sign out → any studio link goes to sign-in.

### Phase 3: Finish
- [ ] **Task 7: Owner approves new accounts** (only if chosen) (`server.mjs`, `web/src/app.js`; S)
  - A small list of pending accounts with Approve / Remove, owner only.
- [ ] **Task 8: Translations** (`web/src/i18n/keys.json`, run `i18n.mjs`; S)
  - All new sign-up and sign-in text in the ten languages.
- [ ] **Task 9: README and `.env.example`** (S)
  - `SESSION_SECRET`, how the first owner is made, how to reset a forgotten password.

### Checkpoint 3
- [ ] All tests pass, build clean, full flow checked in the browser, you review.

## Not in this plan
- Password reset by email (needs an email service). For now the owner resets it, or a one-line script does.
- Google or other social sign-in, roles beyond owner and editor, a log of who filed which story.

## Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Open sign-up lets strangers spend API money | High | Owner approval (Task 7), or an invite code |
| Lost `data/users.json` locks everyone out | Med | First sign-up after that becomes owner again; back up `data/` |
| Forgotten password with no email reset | Low | Owner reset / script (Task 9) |

## Open questions
1. Who may sign up: anyone, owner approval (recommended), or only people with an invite code?
2. Should watching finished videos also need sign-in, or only making and changing them? (Plan assumes everything.)
3. Keep the intro page opening first before sign-in?

## Follow-up (2026-10-14): the intro for visitors who aren't signed in
- [x] Public showcase of finished stories only (`/api/showcase`, their posters and finals); drafts, scripts, voices,
      downloads and the studio stay behind the sign-in. Template pictures and the wire are public; the wire is
      translated only for signed-in visits, so visitors never spend the owner's Gemini money.
- [x] Intro: Sign in at the top and Create an account at the end for visitors who aren't signed in.
