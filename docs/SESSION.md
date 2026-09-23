# Claude Code session stats

[Русская версия](ru/SESSION.md)

The film was made in one Claude Code session from the brief in [PROMPT_B_nogen.md](../PROMPT_B_nogen.md) (in Russian).
The English version, the voiceover and the subtitles were added later, in a separate session; its numbers are not included here.
The numbers were counted from the transcripts of the session and of nine subagents. Each API message
was counted once.

## Time (23.09.2026, MSK)

| Stage | When | Duration |
|---|---|---|
| Reading the brief and references, plan | 12:55 → 13:10 | 15 min |
| Engine, time grid, hero, bots, room, `story.js`, pipeline | 13:10 → 13:48 | 38 min |
| Soundtrack subagent (in parallel) | 13:18 → 13:45 | 27 min |
| Shots 4–16: 4 parallel subagents; the main agent made shots 1–3 and the player | 13:50 → 14:21 | 31 min |
| Full build, checks, README → first delivery | 14:21 → 14:29 | 8 min |
| Fixes after review: arms, windowsill, smooth QR | 14:33 → 14:47 | 14 min |
| **Whole session** | 12:55 → 14:47 | **1 h 52 min** |

- At 13:59 the PC rebooted. The pause took about a minute, but by then the four shot agents
  had been working for 8–9 minutes each, and they had to be restarted. The new agents continued
  from the files already written to disk.
- The main agent's context was compacted twice: at 13:39 and at 14:15.

## Tokens

| | Main agent | 9 subagents | Total |
|---|---|---|---|
| Output | 560 018 | 507 862 | **1 067 880** |
| Input without cache | 514 | 650 | 1 164 |
| Cache write | 1 057 959 | 1 907 245 | **2 965 204** |
| Cache read | 59 696 025 | 56 481 810 | **116 177 835** |
| **Sum** | 61.3M | 58.9M | **120.2M** |
| API calls | 257 | 325 | 582 |

97% of the sum is cache reads: every call reads the whole accumulated context again.

### Subagents

| Task | Model | Time | Total tokens | Output |
|---|---|---|---|---|
| Soundtrack and sound effects | Opus 5 | 27 min | 9.1M | 128k |
| Shots 4–7 (killed by the reboot) | Opus 5 | 9 min | 2.1M | 27k |
| Shots 8–10 (killed by the reboot) | Opus 5 | 9 min | 2.1M | 35k |
| Shots 11–12 (killed by the reboot) | Opus 5 | 8 min | 0.8M | 1k |
| Shots 13–16 (killed by the reboot) | Opus 5 | 7 min | 1.7M | 6k |
| Shots 4–7, restart | Opus 5.5 | 19 min | 16.7M | 93k |
| Shots 8–10, restart | Opus 5.5 | 10 min | 7.2M | 55k |
| Shots 11–12, restart | Opus 5.5 | 13 min | 8.0M | 74k |
| Shots 13–16, restart | Opus 5.5 | 17 min | 11.1M | 88k |

The main agent ran on Claude Opus 5.5.

## Cost at API prices

| | Model | Output | Cache write | Cache read | Total |
|---|---|---|---|---|---|
| Main agent | Opus 5.5 | $11.20 | $8.46 | $11.94 | **$31.61** |
| Subagents | Opus 5 | $4.93 | $4.64 | $7.45 | **$17.03** |
| Subagents | Opus 5.5 | $6.21 | $5.82 | $8.32 | **$20.35** |
| **Total** | | $22.34 | $18.92 | $27.71 | **≈ $69** |

- **Prices per 1M tokens:**
  - Opus 5.5: input $4, output $20, cache read $0.20;
  - Opus 5: input $5, output $25, cache read $0.50.
- **Cache write:** the main agent wrote a 1-hour cache (2× the input price), the subagents a 5-minute cache (1.25×).
- Fast mode was not used.
- Without the cache, the same 116M tokens read would have cost more than $500.

## Main agent tools

Bash — 136, Read — 89, Write — 36, Edit — 11, Agent — 9, browser — 16 calls.
The result is about 9.5k lines of JS with no npm dependencies.

← [README](../README.md)
