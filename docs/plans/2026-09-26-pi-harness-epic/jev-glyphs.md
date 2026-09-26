# Jev-picked NPC glyphs: spike

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Question: should Jev (TypeSafe System One) pick a Nerd Font glyph category for
each NPC or creature kind, cached per creature, with a rule default until it
answers? Date of run: 2026-09-26. Evidence tags: **[measured]** ran here,
**[read]** read in source or docs, **[inferred]** my reasoning.

Scripts and raw data: `/home/deity/.cache/pi-epic-scratch/jev-glyphs/`
(`taxonomy.ts`, `rules.ts`, `jev-run.ts`, `evaluate.ts`, `labels.json`,
`creatures-all.json`, `jev-cache.json`, `jev-log-*.json`, `predictions.json`).

## Verdict

**Rules first, Jev for the rest** — and the bigger win is a parser change,
not Jev. With subname, type and family on hand, the rules and Jev tie at
57/60 on hand labels. With only what today's parser keeps (name, flags, reaction), Jev drops to 49/60.
With true appear-time state (flags, reaction, no name), the rules score 36/60. Jev was not run on that state. Jev is fast and reliable (p50 226 ms, p95 273 ms, 0 failures in 598
calls). So it is cheap to use as the resolver for the ~23% of creatures the
rules can only label generically.

## 1. How tuicraft calls Jev today [read]

- Client: `src/wow/jev.ts`, `selectJevAction`. `POST https://api.typesafe.ai/v1/systemone`,
  `Authorization: Bearer <key>`, body `{state, model: "jev-latest", questions: {action: {type: "choice", instructions, criteria}}}`.
  The instruction is hard-coded to action selection ("Which currently legal action best serves `standingInstruction`?"),
  so a glyph question needs its own small request builder. It cannot reuse
  `selectJevAction` as it is.
- Key: `TYPESAFE_API_KEY` env var (`src/lib/config.ts:113`), endpoint override `JEV_ENDPOINT_URL` / `TYPESAFE_ENDPOINT_URL`,
  fault injection `JEV_FAULT`. The value comes from the mise env (a local, untracked mise config file names it).
  **Key present under `mise exec`: true** [measured]. The value was never printed.
- Timeouts: `TacticsLoop` bounds each request at `DEFAULT_TIMEOUT_MS = 5000` and stops after `MAX_CONSECUTIVE_TIMEOUTS = 3` (`src/wow/tactics.ts:18-19`).
- The response parser validates `answers.<q>.{choice, probabilities, confidence}`, `model`, `usage.input_tokens`. The API reports
  **tokens only, no price** [read: docs.typesafe.ai/api.md, /primitives/choice.md; measured: no extra top-level fields in 598 responses].
  Choice supports up to 255 options and object criteria (`what` / `not_for`) [read].

## 2. What the client knows about a creature, and when

| When | Fields | Source |
| --- | --- | --- |
| Appear (`SMSG_UPDATE_OBJECT` create) | GUID (so **entry id**: bits 24-47 of a `0xF130…` GUID; `0xF140…` is a pet), level, health, `factionTemplate`, `displayId`, `npcFlags`, `unitFlags` | `UnitEntity` in `src/wow/entity-store.ts` [read] |
| Appear + FactionTemplate.dbc | reaction to self (friendly / neutral / hostile) | `faction-template.ts`, `combat-actions-target.ts` [read] |
| `SMSG_CREATURE_QUERY_RESPONSE` (one per entry, cached in `conn.creatureNameCache`) | **name only today** | `parseCreatureQueryResponse` reads one CString and stops [read] |
| Same packet, dropped today | name2-4, **subname** (`<Innkeeper>`), icon/cursor name, `type_flags`, **creature type**, **family**, **rank**, kill credits, display ids, health/mana multipliers, racial leader, quest items, movement id | wrath layout in `wow_messages/.../smsg_creature_query_response.wowm` [read] |

So even the name arrives after appear. A pre-query default can use only
`npcFlags`, reaction, level and entry. Extending `parseCreatureQueryResponse`
to keep `subName`, `creatureType`, `family` and `rank` costs nothing on the wire,
because the server already sends them.

The logs never recorded subname, type or family. I took them from AzerothCore's
base `creature_template.sql` by entry id. The proxy is checked in one way:
25 seen creatures carry live `npcFlags`, and **all 25 match the template**
[measured]. The live world DB may still differ from the base SQL for others
[inferred].

## 3. Dataset (300 creatures)

- **138 seen in play** [measured]: creature entries decoded from unit GUIDs and `entry` fields in `~/.local/state/tuicraft/session.log`
  (only 60 named), `tmp/m4-live/*` (not kept), `tmp/review-2026-09-24/*` (not kept), `docs/evidence/m3a/*`. Mostly Sunstrider Isle, Eversong,
  Silvermoon and an Orgrimmar visit. Triggers, `[DND]` and invisible units are dropped.
- **162 same-zone supplement** [read]: other `creature.sql` spawns on map 530 in the Eversong / Ghostlands / Silvermoon box,
  not seen in play. They are used as an out-of-sample stress test only.
- Distinct by name+subname. Reaction computed against Xiara's template 1610 with the real `FactionTemplate.dbc`: 188 friendly,
  84 hostile, 28 neutral [measured].
- Players (25 names seen) are not creatures. `player` vs `playerbot` cannot come from any creature field. It needs the
  server's bot roster or a naming convention, so it stays a rules-only category outside Jev [inferred].

## 4. Category enum (39)

`glyphs.ts` does not exist in `design/glyphs/` (not kept), so this lists category names only. No codepoints are proposed.

Rules-only: `player`, `playerbot`.
Jev + rules: `pet`, `guard`, `innkeeper`, `vendor`, `repair`, `class_trainer`, `profession_trainer`, `questgiver`,
`flight_master`, `stable_master`, `banker`, `auctioneer`, `spirit_healer`, `battlemaster`, `guild_services`,
`townsfolk`, `hostile_humanoid`, `murloc_naga`, `beast_canine`, `beast_cat`, `beast_spider`, `beast_bird`,
`beast_boar`, `beast_bear`, `beast_serpent`, `beast_crawler`, `beast_other`, `undead`, `elemental`, `demon`,
`dragonkin`, `giant`, `mechanical`, `critter`, `arcane`, `plant`, `other`.
Each has a `what` / `not_for` criterion in `taxonomy.ts`. Hostility is best shown as colour, not as a separate glyph [inferred].

Gaps the run exposed: `Pet Trainer` and `Riding Trainer` have no slot (Jev chose `stable_master` and
`flight_master`, the rules chose `profession_trainer`). Consider `mount_trainer` or fold them in on purpose.

## 5. Rule baseline (`rules.ts`)

- **Appear tier:** an `npcFlags` ladder (spirit healer > flight > innkeeper > banker > auctioneer > stable > battlemaster >
  guild/tabard > class trainer > profession trainer > repair > vendor > questgiver). If no flag is set, `hostile_humanoid`
  when hostile, otherwise `townsfolk`.
- **Full tier:** type 12 → `pet`, type 8 → `critter`, then the ladder, then subname regexes (trainer / innkeeper / banker /
  flight master / guild master / tabard), then type → family table for beasts, and a few name keywords
  (mana/arcane/wyrm → `arcane`; tender/keeper/lasher/bark → `plant`; murloc/grimscale → `murloc_naga`; guard/grunt/guardian → `guard`).

**Caveat:** I wrote the rules after I saw the list of seen creatures, and the hand labels come from that list. So the
rules' 57/60 is optimistic. The out-of-sample zone set below is the fairer test.

## 6. Jev run [measured]

One Choice question per creature over the 37 non-player categories, with object criteria. The instruction is
"Which map-icon category best fits the NPC or creature described in `creature`?", with focus "prefer service role
over race". It ran two state conditions per creature:
**name-only** = `{name, level, services (decoded npcFlags), reactionToPlayer}`. This is what today's parser gives after the
query response. It is **not** appear-time state, because the name comes later. Jev on true appear-time state (no name) is unmeasured.
**full** = name-only + `{title (subname), creatureType, family, elite}`, which is what an extended parser would give.
In the logs and cache the name-only condition is keyed `appear|…`.
Pool of 4 concurrent requests, 15 s client timeout, retry on 429/529. Cache key `cond|name|subname`.

| | calls | failures | 429/529 retries | p50 | p95 | max | > 5 s | tokens in / out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| name-only | 299 | 0 | 0 | 227 ms | 270 ms | 373 ms | 0 | 2072 / 345 |
| full | 299 | 0 | 0 | 225 ms | 275 ms | 368 ms | 0 | 2103 / 345 |

Plus 2 smoke-test calls (Rabbit), which were served from cache in the main run. Model reported: `jev-1.13.0`.
**Cost: not reported by the API**, and the docs I read give no price. Nearly all input tokens are probably the 37-option
criteria [inferred]. The extra fields add about 30 tokens [measured: +31 tokens full vs name-only].

## 7. Accuracy on 60 hand labels (seen creatures) [measured]

| Method | Correct |
| --- | --- |
| Rules, true appear tier (flags + reaction, no name) | 36/60 |
| Rules as written, name-only state (type/family/subname blanked) | 24/60 (anything unflagged falls to `other`; the rules gain nothing from the name) |
| Jev, name-only state (no subname/type/family) | 49/60 |
| Rules, full tier | 57/60 (optimistic, see caveat) |
| Jev, full state | 57/60 |
| Hybrid: full rules; Jev when rules say `townsfolk`/`hostile_humanoid`/`beast_other`/`other` | 57/60 |

Jev's wrong answers on the full state had confidence 0.89, 0.56 and 0.61. Two right answers were below 0.8.

### Disagreements with my labels

| Creature | Label | Wrong answers |
| --- | --- | --- |
| Rabbit, Toad, Frog, Cat, School of Fish | critter | appearRules=townsfolk |
| Orgrimmar Grunt, Sunstrider Guardian, Silvermoon City Guardian | guard | appearRules=townsfolk |
| Silvermoon Guardian | guard | appearRules=townsfolk, **jevFull=townsfolk** |
| Imp Minion | demon | appearRules=hostile_humanoid |
| Mana Wyrm | arcane | appearRules=townsfolk |
| Mana Stalker, Manawraith | arcane | appearRules=hostile_humanoid |
| Plaguebone Pillager | undead | appearRules=hostile_humanoid |
| Angershade | undead | appearRules=hostile_humanoid, jevNameOnly=hostile_humanoid |
| Eversong Tender, Withered Green Keeper | plant | appearRules=hostile_humanoid, **jevFull=elemental** (type is elemental) |
| Springpaw Cub / Stalker | beast_cat | appearRules=townsfolk / hostile_humanoid |
| Crazed Dragonhawk, Silvermoon Dragonhawk | beast_bird | appearRules=townsfolk |
| Golden Dragonhawk Hatchling | pet | appearRules=townsfolk, jevNameOnly=beast_bird |
| Olvia `<Meat Vendor>` | vendor | jevNameOnly=questgiver |
| Urtharo `<Weapon Merchant>`, Raelis `<Weaponsmith>`, Faraden `<Armorsmith>` | repair | jevNameOnly=vendor |
| Garyl `<Tabard Vendor>` | guild_services | jevNameOnly=vendor |
| **Kredis `<Tabard Vendor>`** | guild_services | appearRules, **fullRules**, jevNameOnly, **hybrid** = vendor (npcFlags lack the tabard bit) |
| Marniel `<Innkeeper>` | innkeeper | jevNameOnly=vendor |
| Magistrix Eredania `<Enchanting Trainer>`, Mathreyn `<Skinning Trainer>` | profession_trainer | jevNameOnly=class_trainer |
| **Well Watcher Solanian** | questgiver | **fullRules=guard**, hybrid=guard ("Watch" keyword) |
| **Sathiel `<Trade Supplies>`** | vendor | appearRules, **fullRules**, hybrid = repair (has repair flag) |

The name-only Jev errors are almost all "can't see the title". The flags alone do not tell a weaponsmith from a
grocer, or an enchanting trainer from a mage trainer, but the subname does.

### Out-of-sample: 162 zone-spawn creatures (no labels) [measured, judgements inferred]

Full rules and Jev-full agree on 147/162 (seen set: 125/138). The 15 disagreements split about evenly:

- Rules right, Jev wrong: `Tender`, `Feral Tender`, `Old Whitebark`, `Eversong Green Keeper` → Jev says `elemental`
  (it follows `creatureType`); `Grimscale Forager` → Jev `hostile_humanoid`; `Arcane Devourer` → Jev `elemental`.
- Jev right, rules wrong: `Mmmrrrggglll <Grimscale Chieftain>` (`murloc_naga`); `Areyn <General Goods>`, `Vara <Cloth & Leather Merchant>`
  (`vendor`; the rules' repair-before-vendor ladder is wrong for TBC general-goods NPCs that also repair); `Argent Scout <The Argent Dawn>` (`questgiver`, conf 0.33).
- Arguable: `Snake`, `Crab`, `Spider` are type critter (rules `critter`, Jev the beast family); `Telenus <Pet Trainer>`, `Perascamin <Riding Trainer>` have no category.

## 8. Recommendation

**Rules first, Jev for the rest, cached per entry.**

1. At appear, draw the `npcFlags` ladder glyph at once, and use reaction for colour. For units with no service flag, draw a neutral
   "unknown creature" glyph rather than guessing `townsfolk` / `hostile_humanoid`. That fallback caused 22 of the 24 appear-tier errors.
2. Extend `parseCreatureQueryResponse` to keep `subName`, `creatureType`, `family`, `rank`, and store them in the per-entry cache that
   `creatureNameCache` already is. This one change moves Jev from 49 to 57 of 60, and rules from 36 (flags + reaction) to 57 (flags + name + subname + type + family); the rules as written get nothing from the name alone. It is the largest gain in the study.
3. After the query response, run the full rules. When they return a generic class (`townsfolk`, `hostile_humanoid`, `beast_other`, `other`;
   69 of 300 here, 23%), or when a subname has no rule match, ask Jev with the **full** state and swap the glyph when it answers.
   Also send it any creature whose subname mentions both goods and a repair flag. Jev beat the rules there.
4. Fix the rule cases found: put `vendor` before `repair` when the subname says goods/supplies. Treat a `Tabard Vendor` subname as
   `guild_services`. Drop the bare "watch" guard keyword. For plant and arcane, prefer the name keyword over creature type (Jev's main error pattern).
   Also consider adding plant/arcane `not_for: "creatureType says elemental"` guidance to the criteria.
5. Don't use Jev alone. It cannot run before the name arrives. With the name but without subname/type/family it scores 49/60, and with them it still misreads type-elemental plants.
   Don't use rules alone: they have no answer for titled quest NPCs, and named hostile humanoids like murloc chiefs.

Budget: at about 2.1k input tokens a call, one call per entry id, a whole zone (~300 entries) is about 630k input tokens once,
forever [measured tokens; price unknown]. Latency (p95 < 0.3 s) is well inside the tactics loop's 5 s bound. The glyph is cosmetic,
so a failure keeps the rule glyph and retries on the next session.

### Cache design [inferred]

- Key: **creature entry id** (GUID bits 24-47), not name+subname. Entry is known at appear, before the name, and is what the server's
  template is keyed by. Name+subname was used in the spike only because the task asked for it.
- Value: `{entry, category, source: "rules" | "jev", confidence, model, questionVersion, name, subname, type, family}`.
- Store: one JSON (or JSONL, append-only) file under `$XDG_STATE_HOME/tuicraft/creature-glyphs.json`, shared by every session and
  character on the machine. Key it by realm too if more than one server is ever used, because entry ids are per-DB.
- Invalidate on `questionVersion` change (enum or criteria edit) or on a model version change if we care. Rule results are recomputed
  on the fly and never stored.
- In-flight dedupe per entry (the same shape as `pendingNameQueries`), a pool of at most 4, and a no-key path that is rules only.

## Check (independent re-run, 2026-09-26)

Scripts: `recheck.ts` (same request body as `jev-run.ts`, cache bypassed), output `recheck-*.json`;
`relabel-pick.json` and `relabel-mine.json` for the re-label.

### Jev re-run: 20 random creatures, both conditions, 40 fresh calls [measured]

| calls | failures | p50 | p95 | max | model |
| --- | --- | --- | --- | --- | --- |
| 40 | 0 | 218 ms | 292 ms | 305 ms | `jev-1.13.0` |

Latency matches the first run (p50 226 ms, p95 273 ms). The small p95 rise is within the noise of 40 samples [inferred].
Answers: **39/40 same choice** as the cached first run. The one change is `full|Sunstrider Mana Tap Counter`
(entry 15468): `arcane` at confidence 0.3 before, `other` at 0.3 now. It is a low-confidence toss-up both times,
so low confidence does mark the unstable answers [inferred from one case]. No other confidence moved by more than 0.1.
Entries: 10880, 16263, 16324, 4075, 15941, 16261, 15399, 16185, 16221, 5610, 5609, 16231, 16183, 2186, 15641,
14843, 15468, 16344, 15942, 16258.

### Re-label: 20 random hand-labelled creatures, labelled blind [measured agreement]

I labelled from name, subname, type, family, flags and reaction, without the first labels. **Agreement: 19/20.**

| Entry | Creature | First label | My label | Evidence |
| --- | --- | --- | --- | --- |
| 2205 | Greymist Warrior | hostile_humanoid | **murloc_naga** | faction 18 in `template.json`, the same faction as Murloc Forager, Murloc Warrior and Murloc Tidehunter; every Greymist entry (2201-2207) uses it [read]. Greymist are Darkshore murlocs [inferred, game knowledge]. |

Effect: rules, Jev (both conditions) and the hybrid all said `hostile_humanoid` for 2205 (`predictions.json`) [read].
With the corrected label, each method loses one: rules full 56/60, Jev full 56/60, Jev name-only 48/60, hybrid 56/60.
The tie and the verdict do not change. Creature type is `humanoid` for murlocs, so a faction-18 rule (or sending
faction to Jev) is the fix [inferred]. Agreed borderline cases: Kredis `<Tabard Vendor>` = `guild_services`
(taxonomy says so), Sathiel `<Trade Supplies>` = `vendor`, Ranger Sallina (quest + class trainer flags) = `class_trainer`.
Carnivous the Breaker (faction 82, humanoid) I left as `hostile_humanoid`, not confident of its race.

### API key scan [measured, counts only]

Key present under `mise exec`: true. The key value was fed to `rg -F -f -` from stdin and never printed.

| Directory | files with key value | `Bearer <token>` | `TYPESAFE_API_KEY=<value>` | `sk-/ts-` style tokens |
| --- | --- | --- | --- | --- |
| `~/.cache/pi-epic-scratch/jev-glyphs` | 0 | 0 | 0 | 0 |
| `tuicraft` epic design scratch (not kept) | 0 | 0 | 0 | 0 |

Scans used `-uu` (hidden and ignored files included).
