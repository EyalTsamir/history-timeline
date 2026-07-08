# /push — Review staged files, sanity-check, and push

You are performing a push workflow for the HistoryTimeLine project. Follow these steps carefully and in order.

There is no UI version badge or version display in this project (it's a static content-driven site, not an app with a beta badge) — do NOT invent a version-bump step. `package.json`'s `version` field is an unused placeholder; leave it alone.

## Step 0: GitHub account safety — check every time, before doing anything else

This machine has **two** GitHub accounts logged into `gh`: `EyalTsamir` (this project's owner) and `Ronen3D` (a different project's owner, unrelated to HistoryTimeLine). HistoryTimeLine must **only ever** be pushed to **EyalTsamir**. Never let it end up on `Ronen3D`.

1. Run `git remote -v`.
2. **If `origin` already exists:** confirm the URL host/owner is `github.com/EyalTsamir/...`. If it's `Ronen3D` or anything else, **STOP** and ask the user before doing anything further — do not push, do not change the remote yourself.
3. **If no `origin` exists** (true as of the last check — this repo has no commits and no remote yet), this is first-time setup:
   - Run `gh auth status` and confirm `EyalTsamir` is an available account. `gh repo create` acts as the **active** account, so if `EyalTsamir` is not currently active, run `gh auth switch --user EyalTsamir` first.
   - Ask the user to confirm the repo name (default: `history-timeline`, matching `package.json`'s `name`) and visibility (public/private) — creating a GitHub repo is a one-time, outward-facing action, so confirm before creating it.
   - Create it with the owner **explicit** in the name, never relying on whichever account happens to be active: `gh repo create EyalTsamir/<repo-name> --source=. --remote=origin --private` (or `--public`, per the user's answer).
   - Verify afterward with `git remote -v` that it points to `github.com/EyalTsamir/...`.
   - Remind the user of the one-time manual step from [docs/spec/development.md](../../docs/spec/development.md#deployment-github-pages): after this first push, go to the repo's **Settings → Pages → Source: GitHub Actions** on GitHub — this can't be done via git/gh push and only needs doing once.

## Step 1: Stage ALL modified files

1. Run `git status` to see all modified, staged, and untracked files.
2. Stage **all** modified and previously-staged files — not just files changed in the current conversation. The push captures the full state of the working tree.
3. **Exclude** (unstage with `git reset HEAD <file>`) only files that are clearly: temporary files, debug artifacts, generated/build output (`dist/`, `public/data/`), log files, `.env` or credential files, or other unintended changes.
4. **If uncertain** about any file — ask the user before proceeding. Do not silently exclude or include ambiguous files.
5. Run `git diff --cached --stat` for an overview of what will be committed.

## Step 2: Local sanity check — SKIPPED BY DEFAULT

`/push` is a fast command. By default, do **not** run `content:validate`, `typecheck`, `test`, or `build` before pushing — rely on CI (`.github/workflows/ci.yml`) to catch issues on `main`. Just note in one line that CI will run these checks.

Only run any of these checks in a given `/push` if the user explicitly asks for it in that turn (e.g. "run typecheck first" or "make sure tests pass before pushing"). If they do, run just what they asked for — don't expand it into the full gauntlet. If a check the user asked for fails, fix the issue (or ask how to proceed) before continuing.

## Step 3: Generate commit message and commit

1. Review all staged changes (read the diffs, not just file names) and identify distinct **change topics** — logical themes that group related changes regardless of which files they touch.
2. If `git log` already has history, match its existing style. Otherwise (e.g. the very first commit) use:
   ```
   <Short imperative summary line, no period>

   - <change topic, one line>
   - <change topic, one line>
   ...
   ```
   - Title line: concise, imperative mood (e.g. "Add semantic zoom threshold curve", "Fix RTL date rendering off-by-one"), under ~70 characters.
   - Body: a flat bullet list (`-`), one line per logical change, feature-level not file-level. Skip the body entirely for small, single-purpose commits.
   - Write in **English**, even though the UI and content are Hebrew.
   - If a change is purely internal (refactor, test-only, docs) with no user-visible effect, say so plainly rather than overstating it.
3. Present the commit message to the user for approval before committing — output it as plain text in the chat response (a fenced code block), not embedded inside an AskUserQuestion option. Ask for approval as a separate, short yes/no question after the message is already visible.
4. Once approved, commit with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer, then push to `origin main` (after re-confirming Step 0's remote check).

## Important notes

- Never push this repo to the `Ronen3D` account or any remote other than `github.com/EyalTsamir/...` — see Step 0.
- Pushing to `main` triggers CI, and once GitHub Pages is configured (Step 0's one-time reminder), also deploys to production — don't push if Step 2 surfaced unresolved failures.
- Do not write scratch/temp files anywhere (especially not into `.git/`) as part of this workflow — if a multi-line commit message is needed, pass it via a Bash heredoc (`git commit -F - <<'EOF' ... EOF`), not a temp file.
- Always ask the user before proceeding if anything is unclear or ambiguous.
- Use Hebrew for user-facing chat messages if the user is communicating in Hebrew. The commit message itself stays in English (Step 3).
