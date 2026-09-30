# Jev chat-wake classifier: design note

Date: 2026-09-30. Status: investigation only; nothing is built.
Question: should Jev (TypeSafe System One, already used for fight
choices) decide when open chat wakes the agent, replacing the fixed
rules in `packages/harness/src/events/rules-chat.ts`?

## Recommendation

Do not build it. Keep the fixed rules: whispers and group channels
wake, say and yell wake only when they name the character, everything
else stays passive. The classifier mostly works, but it cannot tell
playerbots from people, and chat is too rare to pay for: the corpus
has 34 General lines in 2,012 minutes (0.017/min), and none of them
needed an answer. On the fresh measurement below the eight test lines
that the rules decide right stay right under the classifier too; the
three lines where the rules stay broad (whispers and party wake
whatever their content) come out right only when the content happens
to ask something. Revisit only if open chat becomes a real channel
players use to talk to the character.

## Inputs

A classifier call would send one chat line as state: the rendered
line text (`chatText`), the sender, channel and type, and the
character name. The judgment is three independent noul questions over
the same state in one request: addressed to us or not, written by a
person or a bot, and needing an answer or not. Wake when addressed
and needing an answer both clear 0.5; person-or-bot only weights
close calls. This mirrors the existing `selectJevAction` envelope
(`POST https://api.typesafe.ai/v1/systemone`, bearer key from
`TYPESAFE_API_KEY`, `JevSelect` in `packages/harness/src/jev/`), but
needs its own request builder because the instruction is hard-coded
to action selection.

## Choices considered

Single choice with wake, log and passive candidates was rejected:
the three dimensions stay useful separately (a bot line naming us
needs different handling than a human line that needs no answer),
and one flat label hides which part of the judgment failed. Three
nouls in one request keep the dimensions and cost one call. A
confidence gate on top adds nothing: the corpus has no near-threshold
real cases to tune it against.

## Measured cost and latency

Eleven sample lines were sent as three-noul requests
(`addressed`, `person`, `needs_answer`) on 2026-09-30, three runs each
for 33 calls through the live endpoint with model `jev-latest`, which
resolved to `jev-1.13.0` on every call. Latency p50 209 ms, max
281 ms, 0 failures in 33 calls. Mean input tokens per call 405 (range
396-425); output tokens 54 on every call, free. Billing is per input
token at $0.042 per million input tokens
(`https://docs.typesafe.ai/models`, verified 2026-09-30), so one call
costs about $0.000017. At 0.017 chat lines per minute the expected
load is about one call per hour of play, about $0.000017 per hour;
even at one line per minute the classifier costs about $0.001 per
hour.

Sample rows below show the mean of three runs per line; `a`, `p` and
`n` are the addressed, person and needs-answer scores, `wake?` is the
classifier outcome under wake-when-addressed-and-needs-an-answer, and
`rules` is what `rules-chat.ts` decides for the same line today.
Sources `c1`-`c3` and `p1`-`p4` come from the General and party lines
of the Xiara session corpus quoted in
`docs/archive/2026-09-26-pi-harness-epic/event-volume.md`; sources
`s1`-`s4` are synthetic (no such line exists in the corpus, which has
no trade, named-say or foreign-whisper lines at all).

| id | source | chat text | a | p | n | wake? | rules | right? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| c1 | corpus General | Turned in [Wanted: Thaelis the Hungerer]! Time to collect my rewards. | 0.40 | 0.72 | 0.26 | passive | passive (channel lines stay passive) | yes |
| c2 | corpus General | Level 10 and I am only getting started! | 0.42 | 0.72 | 0.06 | passive | passive | yes |
| c3 | corpus General | Another objective completed! Rotlimb Marauder: 4/4 for [Defending Fairbreeze Village] | 0.54 | 0.58 | 0.05 | passive | passive | yes |
| p1 | corpus party | What's in your quest log? | 0.66 | 0.58 | 0.96 | wake | wake | yes |
| p2 | corpus party | Do you have emotes? | 0.65 | 0.54 | 0.94 | wake | wake | yes |
| p3 | corpus party | Okay no emotes yet, anyway | 0.63 | 0.71 | 0.81 | wake | wake | wrong: line closes the thread, nothing to answer |
| p4 | corpus party | Come to me | 0.72 | 0.47 | 0.94 | wake | wake | yes |
| s1 | synthetic trade | WTS [Frostweave Bag] 20g, pm me for a good price | 0.35 | 0.69 | 0.82 | passive | passive | yes |
| s2 | synthetic named say | Xiara, can you spare a heal? | 0.92 | 0.71 | 0.98 | wake | wake | yes |
| s3 | synthetic background say | This quest is so bugged lol | 0.43 | 0.76 | 0.12 | passive | passive | yes |
| s4 | synthetic whisper | Hey, are you around to group up? | 0.71 | 0.77 | 0.96 | wake | wake | yes |

The corpus-channel lines (c1-c3) agree with the rules on all nine
calls. The person score cannot separate bots from people: every
canned corpus line lands at 0.5-0.7 person, the same band as the
synthetic human lines. Per-run addressed scores on c3 sat at
0.52-0.56, a hair above the 0.5 line, but needs-an-answer stayed at
0.05 every run, so the wake outcome never wavered. The only miss is
p3, a party line that acknowledges rather than asks; the rules wake
on party lines whatever their content, and the classifier would wake
here too. Sanitised per-call results (sample, scores, tokens, model,
latency) are kept as the report artifact, with no key material.

## Fallback

When Jev is down, slow, or unkeyed, the router keeps the current
fixed rules unchanged. The classifier may only add wakes for open
chat that already names the character or remove wakes for lines the
rules would wake; whispers and group lines always wake. A classifier
timeout (5 s, matching the tactics loop bound) or transport error
means the fixed rule decides, and consecutive failures disable
classification until the next session start, mirroring the tactics
loop stop-after-three rule. The key stays in `TYPESAFE_API_KEY` and
never enters logs or the design doc.

## What would change this

Player chat addressed to the character that the name check misses
(for example nicknames or indirect requests in say), or bot lines
that name the character and would wake wrongly every few minutes.
Neither appears in the corpus. If that changes, the next step is a
labelled evaluation on real session lines before any build.
