# Roadmap

Do these one chat at a time. Each row is one Agent request. You check the matching lines in `docs/VERIFY.md`.

## Now

1. **Prop recording.** `js/audio.js` only. Loop `audio/prop.mp3`. Pitch and volume follow the inputs `prop(power, speed, airborne)` already uses. Silent when parked with power off and speed under 0.8. Keep the synthesized wind, steps, and one-shots.

## Next

2. **Tent.** Done. On foot, middle mouse opens the menu and the player places `models/Camp.glb`. Do not also drop that model in the world.
3. **Food at camp.** On foot, near the camp, `F` or a new key restores hunger and does not add water cans. Prompt text in `js/main.js`. Logic in `js/fieldkit.js`. Hunger already slows you when it is low; this only adds a way to refill it.
4. **Drop water at camp.** On foot at the camp, a key unloads cans into a camp stock, lowers `aircraft.cargo`, and shows the stock on the meter. No new island.

## Later

5. **Second island.** Done. South of the home cay, open water between. From the south beach the near shore is about 400 m out. Center is about (0, 633). It is a longer kidney shape, about twice the land of the home cay, with a cove on the north side and a freshwater pond inland of that cove. Home spawn is unchanged.

## Not in scope unless you ask

- Reviving `js/airport.js` or the takeoff, landing, and taxi managers.
- A physics engine.
- Agent browser screenshots as the default check.
