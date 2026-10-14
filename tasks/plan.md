# Implementation Plan: Dashavani News Video Generator (v1)

## Overview

A user pastes one or more news items into a text box. The system then:

1. Has an AI model write a broadcast script.
2. Turns the script into a voice track with TTS.
3. Gets a talking AI avatar video from the HeyGen API, lip-synced to that voice track.
4. Picks a news template from our HyperFrames catalog and fills it with the script, headlines, lower thirds, captions and the avatar clip.
5. Renders the MP4.

When the user clicks **Edit**, they land in HyperFrames Studio with that video's project open, so they can adjust anything by hand and re-render.

This is the first working piece of the larger Dashavani project. It covers the Produce stage: script, voice, anchor, graphics and render. Ingestion, the 10-language fan-out and publishing come later.

## The hybrid approach

"Hybrid" here means each part of the job goes to the tool that does it best:

| Concern | Who does it | Why |
|---|---|---|
| What to say (script, headlines, segment split) | **AI model** | Flexible; adapts to any input |
| The voice | **TTS provider** (separate from the avatar) | We own the voice track and its word timings for captions, and can switch provider per language |
| The talking presenter | **HeyGen avatar API**, driven by our TTS audio | Realistic presenter without building lip-sync ourselves |
| The look (layout, graphics, motion, branding) | **Human-designed HyperFrames templates** | Same look every time and on brand; the AI only fills slots, never designs from scratch |
| Which template to use | **AI picks from the catalog** using rules plus the input | "Creates its own template according to the input" without breaking the design |
| Final polish | **A person in HyperFrames Studio** | Edit option → Studio → re-render |

Why not let HeyGen produce the whole video? Then all the graphics, branding and editing would live inside HeyGen, and Studio editing wouldn't work. Why not let the AI write the HTML layout from scratch? Every video would look different, and some would break. Templates with variables give us AI flexibility on a fixed design.

## Approach decision

**Decided 2026-10-08: Option C, the hybrid approach (HeyGen avatar + our TTS + HyperFrames + Studio).** Alternatives (Synthesia, D-ID, Sync Labs, MuseTalk, Remotion, Creatomate, Shotstack) were considered and are not in scope.

| Option | How it works | Verdict |
|---|---|---|
| A. HeyGen does everything | HeyGen templates make the full video | ✗ Graphics are locked inside HeyGen, so HyperFrames Studio can't edit them and the house look can't be enforced. You pay HeyGen for every re-render. |
| B. Fully self-hosted | Open-source TTS and lip-sync on our own GPUs | ✗ For now. Cheapest at large scale, but weeks of ML work and GPU operations, and quality in Indian languages is unproven |
| **C. Hybrid (chosen)** | Our script and TTS → HeyGen avatar only → HyperFrames templates → Studio | ✓ Fastest to build, the look stays ours, editable in Studio, and the avatar provider sits behind an adapter so we can move to B later |

## Pipeline: "cheap draft first, paid avatar last"

The costly step (the HeyGen avatar) runs **only after a person has approved the script and seen a draft**. Edits made while still at the draft stage cost nothing extra.

```
[Text box] + language / format / avatar / voice
   │
 ① SCRIPT        AI → ScriptJSON (only facts from the input)
 ② SCRIPT OK? 👤 review / edit script                        ← accuracy gate
   │
 ③ VOICE         TTS → voice.mp3 + word timings → captions
 ④ TEMPLATE      rules (+ AI tie-break) pick VT-01…VT-05 → fill variables
 ⑤ DRAFT RENDER  template + voice + captions + avatar placeholder → draft.mp4 (cheap, seconds)
 ⑥ DRAFT OK? 👤  approve, or "Edit" → Studio → re-render the draft (free)
   │
 ⑦ AVATAR        HeyGen(avatar_id, voice.mp3) → avatar.mp4         ← the only paid step, run once
 ⑧ FINAL RENDER  swap the avatar into the same project → final.mp4
 ⑨ EDIT          "Edit" → Studio (/#project/<job-id>) → re-render v2, v3… (no new HeyGen call)
```

Rules that keep the pipeline cheap and reliable:
- **Changing the script after ⑦ means a new voice and avatar.** Changing the layout or text on screen only needs a re-render.
- **Cache the avatar** by hash of the audio plus avatar ID, so the same audio never triggers a second paid HeyGen call.
- **Each step is its own job with a status,** so a failure is retried from that step and earlier steps aren't paid for again.
- **Templates in v1:** VT-01 Lead Desk, VT-02 Rundown and VT-05 Pocket Edition. VT-03 Breaking and VT-04 Numbers Desk follow in v1.1.

## Architecture decisions

**As built (2026-10-08, simplified for 2 users):** one Node server (`server.mjs`, plain JS, no build step) + `pipeline.mjs`; jobs are JSON files in `data/jobs/`, one in-process queue runs steps one at a time; `public/index.html` is the UI. Next.js / SQLite / separate worker deferred until there are more users. `npm run mock` runs the whole flow without API keys.


- **TypeScript / Node end to end.** HyperFrames is an npm toolchain, so one language keeps it simple.
- **Web app:** Next.js (or similar): the input page, the job status and preview page, and the Edit button.
- **Job runner:** a simple durable queue (for example pg-boss or BullMQ). Each step is a job, so a failed step can be retried without starting over.
- **Storage:** Postgres (or SQLite for the first slice) for jobs; a local folder or S3 for media; one HyperFrames project folder per video (`projects/<job-id>/`).
- **Templates are folders in a `templates/` catalog**, each with a `manifest.json` saying what it is for (for example single story, multi-story bulletin, breaking news, vertical Short) and which variables it needs. The AI picks from the manifests; it never edits the template source.
- **Data contract first:** a `ScriptJSON` schema validated against strict rules. Every later step depends on it, so we define it before parallel work starts.
- **Studio hosting:** in v1, Studio runs as a HyperFrames preview server on the same machine as the renderer. Edit opens `/#project/<job-id>`. Multi-user hosting comes later (see open questions).
- **AI disclosure** ("AI Presenter – News verified by Dashavani Editorial Desk") is built into every template, not optional.

## Task list

The detailed tasks are in `tasks/todo.md`.

### Phase 0: Prove the risky parts (spikes)
- [ ] Task 1: HeyGen avatar driven by our own TTS audio
- [ ] Task 2: One hand-built HyperFrames news template with variables, the avatar clip and Studio editing

### Checkpoint 0: Go / no-go on the tool choices

### Phase 1: Draft video, no paid avatar yet
- [ ] Task 3: Input page and job record
- [ ] Task 4: AI script writer (text → ScriptJSON)
- [ ] Task 5: Script review screen (approve / edit)
- [ ] Task 6: TTS step with word timings and captions
- [ ] Task 7: Template catalog v1 (VT-01, VT-02, VT-05 and their manifests)
- [ ] Task 8: Template selection and project composer
- [ ] Task 9: Draft render, preview and approval

### Checkpoint 1: Text → approved script → branded draft MP4 (no HeyGen cost)

### Phase 2: Final video and the edit loop
- [ ] Task 10: HeyGen avatar step (after the draft is approved, cached)
- [ ] Task 11: Final render with the avatar swapped in
- [ ] Task 12: Edit → Studio redirect
- [ ] Task 13: Re-render after edits, with version history

### Checkpoint 2: Full loop demo to the manager

### Phase 3: Hardening
- [ ] Task 14: Per-step status, retries and errors
- [ ] Task 15: Usage and cost tracking (HeyGen minutes, TTS characters, renders per job)

### Checkpoint 3: Ready for daily use

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| HeyGen can't lip-sync well to outside audio in Indian languages | High | Task 1 tests Hindi and Telugu first. Fallback: use HeyGen's own voice for the avatar and keep our TTS only for captions |
| The avatar background can't be removed cleanly | Med | Test a green screen vs. a plain background in Task 1; HyperFrames has a remove-background tool as backup |
| Studio is a local dev server, not built for many users | Med | Fine for v1 (two users). Before wider rollout, plan one Studio server per edit session or a hosted option |
| HeyGen cost and render time per minute | Med | Cache the avatar clip per script version; re-renders after Studio edits don't call HeyGen again unless the script changes |
| The AI script contains facts not in the input | High | The prompt only allows facts from the input; check numbers and names in code; a person reviews before publishing |
| The template picker chooses badly | Low | Rules first (story count → template; format → aspect ratio), AI only as a tie-breaker; the user can override |

## Resolved decisions (2026-10-08)

1. Avatar: **HeyGen API**.
2. TTS: **Sarvam AI** (Bulbul) tested first.
3. v1 languages: **English and Telugu**.
4. Studio users: **you and your manager only**, with Studio running on one machine.

## Open questions

- Formats in v1: 16:9 only, or 9:16 Shorts too? The plan assumes both (VT-05 is included).
- One news item per video, or several per bulletin? The plan supports both (VT-01 and VT-02).
