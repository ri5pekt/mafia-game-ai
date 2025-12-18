# Dev Guide (v1) — Mafia Game Canon

This document is a **human-readable reference** for the game’s canonical **roles** and **phase/state machine**.
The **source of truth for code** lives in `packages/shared`:

- `@shared/rules` — roles, phases, ruleset config
- `@shared/types` — shared types and event placeholders

No gameplay logic is implemented yet; this guide exists to keep implementation consistent.

---

## Roles (v1)

Canonical role IDs:

- `TOWN`
- `MAFIA`
- `SHERIFF`
- `MAFIA_BOSS`

Alignment:

- Town-aligned: `TOWN`, `SHERIFF`
- Mafia-aligned: `MAFIA`, `MAFIA_BOSS`

Win conditions:

- **Town wins** if `mafiaAliveCount === 0`
- **Mafia wins** if `mafiaAliveCount >= townAliveCount`

Visibility / reveal rules:

- Roles are **NOT revealed** when a player is eliminated/killed.
- Roles are revealed **only** at `GAME_END`.
- Players may claim any role publicly; host never confirms publicly.

Night abilities (v1):

- `TOWN`: none
- `MAFIA`: participates in mafia night discussion, suggests kill target
- `SHERIFF`: may investigate one alive player, receives private alignment result (👍 town / 👎 mafia)
- `MAFIA_BOSS`: final kill decision, and may “guess sheriff” (private yes/no)

Kill targeting constraints:

- **Self-kill / mafia-on-mafia kill is disallowed** (mafia cannot choose mafia as kill targets).

---

## Phases / State Machine (v1)

Canonical phase IDs (ordered for readability):

- `GAME_INIT`
- `DAY_DISCUSSION`
- `DAY_VOTING`
- `TIE_DISCUSSION`
- `TIE_REVOTE`
- `MASS_ELIMINATION_PROPOSAL`
- `ELIMINATION_SPEECH`
- `WIN_CHECK`
- `NIGHT_MAFIA_DISCUSSION`
- `NIGHT_MAFIA_BOSS_GUESS`
- `NIGHT_SHERIFF_ACTION`
- `NIGHT_KILL_RESOLUTION`
- `GAME_END`

High-level loop:

1. Start at `GAME_INIT`
2. `DAY_DISCUSSION` → `DAY_VOTING`
3. Voting outcomes:
   - Single winner → eliminate → `ELIMINATION_SPEECH` → `WIN_CHECK`
   - Tie → `TIE_DISCUSSION` → `TIE_REVOTE` (repeat up to max rounds)
   - Still tied at max rounds → `MASS_ELIMINATION_PROPOSAL`
     - If majority yes: eliminate all tied candidates (each gets `ELIMINATION_SPEECH`) → `WIN_CHECK`
     - If majority no: eliminate nobody → proceed to night
4. If no winner: run night phases
   - `NIGHT_MAFIA_DISCUSSION` → `NIGHT_MAFIA_BOSS_GUESS` → `NIGHT_SHERIFF_ACTION` → `NIGHT_KILL_RESOLUTION` → `WIN_CHECK`
5. If no winner: increment day and return to `DAY_DISCUSSION`
6. Winner: `GAME_END`

### Discussion rules

- During `DAY_DISCUSSION`, **every alive player speaks exactly once**.
- Speaking order rotates by day:
  - Day 1: `P1 → P10`
  - Day N: starting player shifts by +1 (mod alive players order)
- Implementation idea: store a `discussionStartIndex` derived from day number.

### Voting rules

- Candidates are players suggested during discussion (from events).
- Host calls candidates one-by-one; each alive player votes once per call.
- `MAX_VOTE_ROUNDS` default: **3**
- Still tied at max rounds: `MASS_ELIMINATION_PROPOSAL` as described above.

### Elimination speech

- Any removed player gets a final speech.
- Roles are **not revealed**.

### Night mafia discussion

- All alive mafia members speak once, suggesting kill target + reasoning.
- Mafia speaking order rotates each night similarly to day discussion.
- Final kill target:
  - Mafia Boss alive: boss decides
  - Boss dead: “acting boss” is the first speaker of that night (rotating)
  - Only one mafia alive: that mafia provides suggestion + reasoning + decision
- Mafia cannot target mafia.

### Night boss guess

- If Mafia Boss alive: boss points at one alive player.
- Host replies privately yes/no if that player is sheriff.

### Sheriff action

- If Sheriff alive: investigates one alive player.
- Host replies privately 👍/👎 alignment.

### Night kill resolution

- Apply mafia kill target (if any) to remove a player.
- That player gets a final speech.
- Roles not revealed.

### WIN_CHECK (mandatory)

Occurs after any elimination(s):

- After `ELIMINATION_SPEECH` (day lynch) → `WIN_CHECK`
- After `MASS_ELIMINATION_PROPOSAL` eliminations → `WIN_CHECK`
- After `NIGHT_KILL_RESOLUTION` → `WIN_CHECK`

If no winner, continue the loop.


