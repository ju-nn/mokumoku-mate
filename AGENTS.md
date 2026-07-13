# Repository Guidelines

## Project Snapshot

- App name: もくもくメイト.
- Stack: Vite + React + TypeScript, plain CSS, npm.
- Main app files:
  - `src/App.tsx`: application state, timeline behavior, timer, views, dialogs.
  - `src/data.ts`: mates, categories, quests, tickets, timeline comment templates.
  - `src/storage.ts`: localStorage persistence and migration/normalization.
  - `src/types.ts`: shared domain types.
  - `src/affinityDialogues.ts`: mate affinity tiers and profile dialogue data.
  - `src/style.css`: all app styling.
- Public assets live under `public/`, especially `public/mates/*.png`.
- Released URL: https://ju-nn.github.io/mokumoku-mate/

## Current Product Behavior

- The home screen is the actual app experience: timeline plus task/timer panel.
- The timeline should feel like a lightweight SNS, but not over-busy.
- A single post should usually receive 0 or 1 reply. Avoid adding logic that creates many replies on one parent post.
- "既読" is intentionally not used. Reactions are represented by replies and occasional mate likes.
- Task results are intentionally limited to:
  - `complete`: できた
  - `partial`: 少しできた
  - `interrupted`: 中断した
- Legacy saved `failed` results are normalized to `interrupted`; do not reintroduce a visible "無理だった" result button.
- Tutorial posts are progressive. Do not seed the full tutorial list into the timeline at once.
- Weekly quests close on the configurable "週の締め日"; default is Sunday at 23:59.
- Pomodoro mode exists alongside the free timer.
- Browser notifications are optional and controlled in settings.

## Release And Deployment

- `main` contains the source app.
- `gh-pages` contains the built static site that GitHub Pages currently serves.
- `vite.config.ts` sets production base to `/mokumoku-mate/`; keep this for GitHub Pages.
- Before release, run:
  - `npm run build`
- After building, deploy the `dist/` contents to the `gh-pages` worktree at:
  - `C:\Users\rebir\CascadeProjects\mokumoku-mate-ghpages`
- The deployed page must be verified at:
  - https://ju-nn.github.io/mokumoku-mate/
- Release verification should include:
  - top page returns 200
  - JS/CSS paths include `/mokumoku-mate/`
  - mate images load from `/mokumoku-mate/mates/...`
  - browser check shows no broken images
  - browser console has no errors

## UI Implementation

- Prefer existing local UI patterns in `src/App.tsx` and `src/style.css` unless a larger refactor is explicitly requested.
- shadcn/ui is not currently initialized in this repo. If introducing shadcn/ui, first check the project configuration with `npx shadcn@latest info --json` and initialize intentionally.
- Use the project package runner. This repo currently uses npm, so shadcn commands should use `npx shadcn@latest ...`.
- Follow shadcn composition patterns: use full `Card` structure, `FieldGroup` and `Field` for forms, `ToggleGroup` for small option sets, `Badge` for status labels, `Separator` instead of custom divider markup, and `sonner` for toast feedback.
- Use semantic theme tokens from the shadcn/Tailwind theme instead of raw one-off color utilities.
- Keep layout classes in `className`, but do not override shadcn component colors or typography unless there is a clear product-specific reason.
- Preserve the product personality. Custom illustrations, character art, timeline post layouts, and domain-specific playful details may stay custom when shadcn components would make them less expressive.
- Avoid generic AI-looking visual defaults such as dominant purple gradients, oversized marketing hero layouts, and decorative gradient blobs.

## Quality Notes

- Keep timeline language varied, but avoid making every action generate a reply.
- Prefer small, human-feeling variation over large noisy systems.
- Do not add "landing page" style hero sections; the app should open directly into the usable workspace.
- Avoid text or UI that explains implementation details to the user.
- When touching storage or types, preserve localStorage compatibility through normalization.
- Do not commit `dist/` to `main`; only deploy built files to `gh-pages`.
