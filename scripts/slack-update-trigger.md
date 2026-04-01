# Slack Daily Update Trigger

This prompt runs as a scheduled Claude Code trigger at 9:00 AM EST, Mon–Fri.

## Instructions

1. Read `C:/pg/pcc/.slack-update.json` for `last_sha` and `webhook_url`.
2. If `webhook_url` is empty, stop and log "Webhook URL not configured."
3. Run `git log --format="%h %ad %s" --date=short <last_sha>..HEAD` in `C:/pg/pcc`.
4. If no new commits, stop — do not post.
5. Read `C:/pg/pcc/docs/_internal/ROADMAP.md` for progress context (area names, epic completion).
6. Read `C:/pg/pcc/docs/_internal/TODO.md` summary table + blocked/deferred items.
7. Run `git diff --stat HEAD` to identify uncommitted work.

## Synthesis rules

Categorize commits into four sections. Every bullet must answer "now the app can..." — no process language ("shipped", "implemented", "refactored"). No fluff. Plain english, technical-documentation tone.

**Sections:**
- **Scientific engine** — new methods, classification changes, scoring logic
- **Architecture** — plumbing, config extraction, performance, DSL, registries
- **Views** — UI capabilities. Name new views explicitly. For existing views, state the new capability, not the component.
- **Data pipeline** — import, generation, validation, benchmarks

**Footer (one line only, only if applicable):**
- **In-flight:** uncommitted work from `git diff` — shows what's being worked on but not yet committed

## Formatting (Slack mrkdwn)

**Top-level message:**
```
SENDEX update — <start_date>–<end_date>
```

**Thread reply (posted as comment on the message):**
```
*Scientific engine*
• bullet
• bullet

*Architecture*
• bullet

*Views*
• bullet

*Data pipeline*
• bullet

*In-flight:* ...
```

## Posting

Use curl to post to the Slack webhook. Two API calls:
1. Post the top-level message, capture the `ts` from response.
2. Post the thread reply using `thread_ts` = captured `ts`.

After successful post, update `.slack-update.json` with the new HEAD sha and today's date.

## Guardrails

- Skip days with 0 commits.
- Keep total thread reply under 200 words.
- Max 4 bullets per section. If more, group related commits into higher-level outcomes.
- Never mention commit counts, time spent, or speed of delivery.
- Roadmap progress fractions (e.g., "~40% of spec") only for multi-phase epics.
