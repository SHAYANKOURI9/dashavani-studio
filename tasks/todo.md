# Tasks: Dashavani News Video Generator (v1)

The plan is in `tasks/plan.md`: hybrid approach, cheap draft first and the paid avatar last. File paths are proposals; the repository doesn't exist yet.

---

## Phase 0: Spikes (prove the risky parts first)

### Task 1: HeyGen avatar driven by our own TTS audio
**Description:** A throwaway script that sends a **Sarvam AI** TTS audio file to the HeyGen avatar API, polls until the video is ready, and downloads the MP4. Try English and Telugu, and a green vs. plain background. Also check what word timings Sarvam returns; if they're missing, plan to get them by transcribing the audio.
**Acceptance criteria:**
- [ ] Avatar MP4 for English and Telugu using Sarvam audio
- [ ] Lip-sync rated acceptable by you and your manager
- [ ] Background-removal method chosen; time and cost per minute recorded
**Verification:** Manual check: watch all 3 clips side by side.
**Dependencies:** None
**Files:** `spikes/heygen-avatar.ts`, `spikes/README.md`
**Scope:** S

### Task 2: Turn VT-01 Lead Desk into a real HyperFrames template
**Description:** Rebuild the approved VT-01 design from the catalog as a HyperFrames composition. Headline, category, language badge, captions and the avatar clip all become variables. Render it with two sets of values, then edit it in Studio.
**Acceptance criteria:**
- [x] `hyperframes lint` reports nothing
- [x] Two variable sets produce two different videos without changing the HTML
- [ ] Studio opens at `/#project/<name>`; an edit is saved and shows up when re-rendered
**Verification:** `npx hyperframes lint`, `npx hyperframes render --variables-file …`; manual check in Studio.
**Dependencies:** Design approved
**Files:** `templates/vt01-lead-desk/index.html`, `templates/vt01-lead-desk/manifest.json`
**Scope:** M

## Checkpoint 0: Go / no-go
- [ ] HeyGen, the TTS provider and HyperFrames confirmed
- [ ] ScriptJSON schema drafted from the template's variables
- [ ] Reviewed with your manager

---

## Phase 1: Draft video, no paid avatar yet

### Task 3: Input page and job record
**Description:** A text box for news item(s), plus options for language, format, avatar and voice. Submitting creates a job and opens `/jobs/<id>`.
**Acceptance criteria:**
- [ ] Submitting creates a job and redirects to its page
- [ ] Empty or too-long input is rejected with a clear message
**Verification:** Tests pass; manual check.
**Dependencies:** Checkpoint 0
**Files:** `app/page.tsx`, `app/jobs/[id]/page.tsx`, `db/schema.ts`, `lib/jobs.ts`
**Scope:** M

### Task 4: AI script writer (text → ScriptJSON)
**Description:** The AI model turns the input into strict ScriptJSON: headline, a category, segments with their spoken text, lower thirds, ticker items and a target duration. Only facts that appear in the input are allowed.
**Acceptance criteria:**
- [ ] The output always passes schema validation (one retry, then a clear failure)
- [ ] Every number and name in the script appears in the input (automatic check)
- [ ] Several news items become one segment each
**Verification:** Unit tests with 5 sample inputs, including Hindi and Telugu.
**Dependencies:** Task 3
**Files:** `lib/script/schema.ts`, `lib/script/writer.ts`, `lib/script/writer.test.ts`
**Scope:** M

### Task 5: Script review screen
**Description:** The job page shows the generated script next to the input. The user can edit the headline and the segments, then approve. Nothing after this step runs until the script is approved.
**Acceptance criteria:**
- [ ] Edits are saved and re-validated against the schema
- [ ] Without approval, the job stays at `SCRIPT_REVIEW`
**Verification:** Manual check: edit a headline, approve, and the job moves on.
**Dependencies:** Task 4
**Files:** `app/jobs/[id]/ScriptReview.tsx`, `lib/jobs.ts`
**Scope:** S

### Task 6: TTS step with word timings and captions
**Description:** Approved script → `voice.mp3` + word timings → `.vtt` and captions JSON. The provider sits behind one interface so it can be swapped.
**Acceptance criteria:**
- [ ] The audio length is within ±15% of the target duration
- [ ] Captions line up with the audio (spot check)
**Verification:** Tests pass; manual check: listen while the captions play.
**Dependencies:** Task 5
**Files:** `lib/tts/index.ts`, `lib/tts/<provider>.ts`, `lib/captions.ts`
**Scope:** M

### Task 7: Template catalog v1 (VT-01, VT-02, VT-05)
**Description:** Add VT-02 Rundown and VT-05 Pocket Edition (9:16) alongside VT-01. Each gets a `manifest.json` with its purpose, aspect ratio, story-count range and variables. The avatar slot falls back to a placeholder when no clip is supplied.
**Acceptance criteria:**
- [ ] All 3 pass lint and render with their default values
- [ ] Each manifest's variables match the template's declared variables
**Verification:** `scripts/check-templates.ts` lints and renders every template.
**Dependencies:** Task 2 (can run in parallel with Tasks 3–6)
**Files:** `templates/*/index.html`, `templates/*/manifest.json`, `scripts/check-templates.ts`
**Scope:** M

### Task 8: Template selection and project composer
**Description:** Pick a template using rules (story count and format), with the AI only breaking ties; the user can override. Build `projects/<job-id>/` from the template plus ScriptJSON, the voice track and the captions, without modifying the catalog source.
**Acceptance criteria:**
- [ ] 1 story with 16:9 → VT-01; 2 or more stories → VT-02; 9:16 → VT-05
- [ ] The composed project passes lint
**Verification:** Unit tests for the selector; lint the composed project.
**Dependencies:** Tasks 6 and 7
**Files:** `lib/templates/select.ts`, `lib/templates/compose.ts`, tests
**Scope:** M

### Task 9: Draft render, preview and approval
**Description:** Render `draft.mp4` with the avatar placeholder and show it on the job page with Approve and Edit buttons. Edit opens Studio here too, and draft re-renders are free.
**Acceptance criteria:**
- [ ] The job page plays the draft; Approve moves the job to `AVATAR`
- [ ] A render failure shows the error and offers a retry
**Verification:** Manual check: text → approved script → draft MP4.
**Dependencies:** Task 8
**Files:** `lib/render.ts`, `app/jobs/[id]/page.tsx`
**Scope:** S

## Checkpoint 1: Branded draft with no HeyGen cost
- [ ] 3 sample inputs → 3 correct drafts
- [ ] Tests pass; demo to your manager

---

## Phase 2: Final video and the edit loop

### Task 10: HeyGen avatar step
**Description:** Runs only after the draft is approved. Upload `voice.mp3`, request the avatar video, poll with backoff, download `avatar.mp4`. Cache it by hash of the audio plus avatar ID.
**Acceptance criteria:**
- [ ] Runs once per approved draft; the same audio and avatar never trigger a second paid call
- [ ] A failure or timeout can be retried without redoing TTS
**Verification:** Tests with a mocked API; one real end-to-end run.
**Dependencies:** Task 9, and Task 1's findings
**Files:** `lib/avatar/heygen.ts`, `lib/avatar/heygen.test.ts`
**Scope:** M

### Task 11: Final render with the avatar swapped in
**Description:** Set the avatar variable in the same project to `avatar.mp4` (with its background removed) and render `final_v1.mp4`.
**Acceptance criteria:**
- [ ] The final video matches the approved draft except that the avatar is real
- [ ] Lip-sync stays in step with the captions for the whole video
**Verification:** Manual check: compare the draft and the final side by side.
**Dependencies:** Task 10
**Files:** `lib/render.ts`, `lib/templates/compose.ts`
**Scope:** S

### Task 12: Edit → Studio redirect
**Description:** The Edit button makes sure a Studio server is running for `projects/`, then redirects to `/#project/<job-id>`.
**Acceptance criteria:**
- [ ] Studio opens with this job's timeline loaded, not an empty Studio
- [ ] Studio starts automatically if it isn't running; if it fails to start, a clear error is shown
**Verification:** Manual check: click Edit on 2 different jobs.
**Dependencies:** Task 9
**Files:** `lib/studio.ts`, `app/api/jobs/[id]/edit/route.ts`
**Scope:** S

### Task 13: Re-render after edits, with version history
**Description:** Re-render the edited project as `final_v2`, `v3` and so on, keeping earlier versions. HeyGen is called again only if the script text changed.
**Acceptance criteria:**
- [ ] Studio edits appear in the new version; earlier versions stay downloadable
- [ ] Editing only on-screen text or layout makes no HeyGen call
**Verification:** Manual check: edit a headline → re-render → compare v1 and v2.
**Dependencies:** Tasks 11 and 12
**Files:** `lib/render.ts`, `db/schema.ts`, `app/jobs/[id]/page.tsx`
**Scope:** S

## Checkpoint 2: Full loop
- [ ] Text → script approval → draft → final → Studio edit → v2, for all 3 templates
- [ ] Demo to your manager

---

## Phase 3: Hardening

### Task 14: Per-step status, retries and errors
**Description:** Each step (script, TTS, compose, draft, avatar, final) has a status, retry with backoff, a readable error, and "retry from this step".
**Acceptance criteria:**
- [ ] Forcing a HeyGen failure lets you retry from the avatar step without paying for TTS again
- [ ] No step fails silently
**Verification:** Tests with injected failures.
**Dependencies:** Task 13
**Files:** `lib/jobs.ts`, `lib/pipeline.ts`, tests
**Scope:** M

### Task 15: Usage and cost tracking
**Description:** Record per job: HeyGen seconds, TTS characters, AI model tokens, and the number and time of renders. Show the totals per day and per job.
**Acceptance criteria:**
- [ ] Each job page shows its usage; a daily total is available
- [ ] The numbers match the provider dashboards for 3 sample jobs (within 5%)
**Verification:** Compare against the HeyGen and TTS provider dashboards.
**Dependencies:** Task 14
**Files:** `lib/usage.ts`, `db/schema.ts`, `app/usage/page.tsx`
**Scope:** S

## Checkpoint 3: Ready for daily use
- [ ] All tests pass; full loop is reliable over 10 consecutive jobs
- [ ] Review with your manager before planning the 10-language fan-out
