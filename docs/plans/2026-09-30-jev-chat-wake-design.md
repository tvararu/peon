# Jev chat-wake classifier: design note

Date: 2026-09-30. Status: investigation only; nothing is built.
Question: should Jev (TypeSafe System One, already used for fight
choices) decide when open chat wakes the agent, replacing the fixed
rules in `packages/harness/src/events/rules-chat.ts`?

## Recommendation

Do not build it. Keep the fixed rules: whispers and group channels
wake, say and yell wake only when they name the character, everything
else stays passive. The classifier works, but chat is too rare to pay
for it: the corpus has 34 General lines in 2,012 minutes (0.017/min),
and none of them needed an answer. The rules already give the right
answer on every sample below except one ambiguous trade line that also
deserves no wake. Revisit only if open chat becomes a real channel
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

Six sample lines (two human whispers/group, one canned playerbot
turn-in, one trade spam, one named say, one background say) were sent
as three-noul requests on 2026-09-30. Latency p50 215 ms, max
273 ms, 0 failures in 8 calls. The reply reports usage only, no
price: about 300 input tokens and 20 output tokens per call for this
shape. At 0.017 chat lines per minute the expected load is about one
call per hour of play, roughly 300 input tokens per hour. The
classifier answers correctly on five of six samples; it scores the
trade spam as likely human (0.77) but not addressed (0.11), so the
wake rule still gives the right outcome. The canned turn-in scores
addressed 0.08 and needing an answer 0.56; under the wake rule it
stays passive.

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
