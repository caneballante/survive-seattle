# Survive Seattle

A playable browser life-sim about coffee, work, rent, status, and unreasonable optimism. The game is built with TypeScript, Vite, and Phaser 3. All artwork is generated at runtime from original shapes and text.

## Run it

Requires a current Node.js LTS release.

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. On an iPhone, use Safari or Chrome in landscape orientation and visit the development machine's network URL.

## Controls

- Walk: `A` / `D` or left / right arrow keys
- Run: hold `Shift` while moving; running spends Energy
- Interact: `E` or `Space`
- Close a menu: `Escape`
- Development panel: `F2` or backtick
- Touch: left, right, **Run**, and **Interact** buttons appear on phones and smaller landscape screens
- **Sound: on/off** mutes or resumes the soundtrack and effects
- **Reset game** restarts Year 1, Spring, Day 1

Portrait phones receive a polite rotate-to-landscape screen.

## Audio

Music begins after the first click, tap, or key press because browsers block
autoplay before player interaction. The current CC0 placeholder soundtrack,
UI feedback, concrete footsteps, notifications, and expansion impact live in
`public/audio`. Their original sources and licenses are recorded in
`public/audio/README.md`.

## Atmosphere and time

The accelerated clock now drives a continuous Seattle day/night treatment:
layered parallax clouds drift at different speeds, Mount Rainier and the skyline
fade with the weather, windows begin to glow near dusk, and the sun, moon,
stars, horizon, and precipitation all respond to the current time. Ordinary
days rotate through seasonally weighted rain, overcast, and clear conditions;
snow and smoke remain special city events. Large time jumps from interactions
ease between palettes so a two-hour activity feels like time passing instead
of an abrupt background swap.

## Open street and visible aspirations

The entire modeled street is walkable on Day 1. The Tiny Apartment sits near
the middle, but the player can continue far west or east and inspect every
storefront. Walking advances the game clock, while running covers more ground
at the cost of Energy, so a long exploratory trip also creates a return journey.

Progression changes what the player can afford, enter, or meaningfully do
instead of hiding the street. Mossback Music displays its $120 guitar
immediately, and Very Serious Art Supply advertises its Status 3 expectation
before the player qualifies. World stages can introduce new opportunities and
interior changes without moving invisible geographic walls.

Far construction boundaries remain visible at the ends to show that Seattle
continues beyond the current playable slice.

## First-day loop

1. Find coffee.
2. Inspect **Jobs, Probably** and accept the Cascadia Solutions role.
3. Work a shift.
4. Return to the Tiny Apartment and sleep.
5. On Day 2, revisit distant storefronts as new possibilities develop.

Valid interactions can happen in another order. Opportunities guide rather than gate exploration.

## New interactions

- **The Bare Minimum:** cheap meal, $8 and 30 minutes, Happiness +1
- **Mossy Pocket Park:** one-hour walk, Happiness +1, once daily
- **The Crooked Salmon:** available after 5 PM, $15 and two hours, Status +1 and Happiness +1
- **The Damp Curtain:** volunteer three hours, Status +2, once per season
- **Mossback Music:** browse to reveal a $120 guitar; buying it grants the guitar and Happiness +2
- **Very Serious Art Supply:** requires Status 3; a $20 sketchbook grants Happiness +1
- **Arrival Block Transit:** activates after the first expansion; a $3 trip previews a second district

The accelerated calendar has five days per season and twenty days per year. Seasonal boundaries reset seasonal limits and charge the current rent.

## Street pressure

The player now stays on one grounded side-scrolling plane. The crowd can still
occupy two visual depths, but up/down movement is reserved for a future climb,
crouch, or avoidance action. The first crowd pass adds four data-driven encounters:

- A phone walker drifts between lanes and turns collisions into time or social costs
- An aggressive panhandler intercepts the player and offers Money, time, or Energy responses
- A fast bicycle group telegraphs its approach and can spill a carried coffee
- A neighborhood regular offers a positive time-versus-community choice

Coffee now costs $5, restores Energy, and appears in the character's hand.
Sustained running spends Energy. Food, rest, parks, and sleep provide recovery,
while work consumes 35 Energy and must be started before noon.

## City events

Eight editable events live in `src/game/cityEvents.ts`:

- Parents Visit
- Snow Day
- Rent Increase
- Bridge Closure
- Beautiful Clear Day
- Smoke Week
- Local Sporting Event
- Mandatory Authenticity

Events have eligibility checks, tailored selection scores, and day-based cooldowns. They can change statistics, rent, weather, travel time, location availability, interaction rewards, descriptions, and the citywide trend shown in the HUD.

## Development panel

Press `F2` or backtick, or open the game with `?debug=1`.

The panel can:

- Add or remove Money, Status, Happiness, and Energy
- Set morning, sunset, or night time
- Advance the day, season, or year
- Unlock expansion stages
- Add the guitar or sketchbook
- Trigger any event or the best tailored event
- Reset local prototype state
- Inspect active opportunities, items, events, and cooldowns

The panel is hidden by default and does not affect normal phone play.

## Add content

### Add a location

1. Add its ID to `LocationId` in `src/game/types.ts`.
2. Add a `LocationDefinition` in `src/game/locations.ts`.
3. Assign a region, rarity, world position, description, and interaction IDs.

The Phaser scene generates the building, sign, highlight, opportunity marker, and region visibility from that data.

### Add an interaction

Add an `InteractionDefinition` in `src/game/interactions.ts`, then reference its ID from a location. Requirements, costs, rewards, items, story flags, daily limits, and seasonal limits are enforced by `GameState.performInteraction`.

### Add an event

Add a `CityEventDefinition` in `src/game/cityEvents.ts`. Provide its eligibility rule, cooldown, tailored score, and resolution. The debug panel discovers it automatically.

### Add a street encounter

Add a `StreetEncounterDefinition` in `src/game/streetEncounters.ts`. Define its
schedule, lane, movement behavior, visual palette, choices, requirements, and
signed effects. `GameState.resolveStreetEncounter` applies the generic result;
new encounter choices do not require encounter-specific state branches.

## Verification

```powershell
npm test
npm run build
```

Tests cover the original Day 1 logic plus open-world bounds, visible
aspirations, Energy, street encounter resolution, carried-coffee loss, travel
time, daily weather rotation, interaction requirements and costs, daily and
seasonal limits, inventory, calendar transitions, event eligibility, cooldowns,
tailoring, rent persistence, event modifiers, and opportunity direction.

## Architecture

- `src/game/state.ts` — statistics, calendar, jobs, inventory, interactions, regions, and event application
- `src/game/interactions.ts` — reusable interaction catalog
- `src/game/cityEvents.ts` — event catalog, eligibility, cooldowns, and tailored selection
- `src/game/regions.ts` — open street bounds and content-progression stages
- `src/game/locations.ts` — location catalog, rarity, regions, and world positions
- `src/game/streetEncounters.ts` — crowd behaviors, choices, requirements, and effects
- `src/game/movement.ts` — walking, sprinting, Energy, and travel-time constants
- `src/game/weather.ts` — deterministic seasonally varied daily weather
- `src/game/atmosphere.ts` — time- and weather-driven palette sampling
- `src/game/opportunities.ts` — priority-based guidance lifecycle
- `src/game/SeattleScene.ts` — generated art, crowd movement, lanes, camera, weather, and lighting
- `src/ui.ts` — HUD, menus, dialogue, and touch controls
- `src/debugPanel.ts` — development-only inspection and triggering tools

State remains session-only for this slice. The debug panel's clear-save action is already scoped to the future `survive-seattle-save` key so persistence can be added without changing the tool.
