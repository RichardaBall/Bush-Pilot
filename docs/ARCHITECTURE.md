# Architecture

Static Three.js page. No bundler. `index.html` loads `js/main.js` as a module. Three.js comes from unpkg.

## Loop

`Game` in `js/main.js` owns the scene, camera, input, and one `requestAnimationFrame` loop.

Each frame, in order:

1. `FieldKit.update` drains hunger, thirst, and stamina on foot. The aircraft charges when the solar cable is plugged in and the plane is parked. A wind turbine charges it the same way, day or night, when its cable is on the plane, or on the tent while the tent cable is also on the plane.
2. `Player.update` moves the pilot when `mode` is `ON_FOOT`.
3. `Smurf.update` wanders, follows, or runs home.
4. `GroundFx` stamps feet and wheel dust. `Terrain.setGrassContact` bends grass.
5. If `IN_AIRCRAFT`, `Aircraft.updatePoweredFlight` changes power, speed, and pose. Rejected landings set a short hint.
6. `Soundscape` updates wind and the propeller from power, speed, and whether the plane is airborne.
7. `Terrain.update` streams detail around the focus point. The camera follows the player or the plane.
8. `handleStateTransitions` reads `E` / `F` / `G` and writes the HUD.

## Modes

| Field | Values | Meaning |
| --- | --- | --- |
| `mode` | `ON_FOOT`, `IN_AIRCRAFT` | Who the camera and keys control |
| `aircraftState` | `PARKED`, `FLYING` | Shown in the HUD. `FLYING` when airborne or speed is at least 0.8 |

`E` near a parked plane boards. `E` while parked exits beside the plane. `F` at water fills thirst and adds a can and cargo. On foot the camp menu places the solar panel, within about 12 m of the parked plane, and the player runs a cable to the fuselage. It charges only while that cable is plugged in. The same menu places a wind turbine within about 12 m of the parked plane or the placed tent. Its cable plugs into the fuselage or the tent. On the tent it powers the tent light. If the tent cable is also plugged into the plane, that light stays on and the turbine charges the plane instead of draining it. `G` in the parked cockpit packs the panel and the turbine. Either one must be packed before adding power.

## Files

| File | Role |
| --- | --- |
| `js/main.js` | Scene, input, camera, HUD, mode changes |
| `js/terrain.js` | Island height, coast, spit, water, scatter, solids, landable ground |
| `js/player.js` | On-foot move, look, wade and swim, Mixamo idle/walk/run |
| `js/aircraft.js` | Piper pose, power, speed, charge, cargo, takeoff and landing rejection |
| `js/fieldkit.js` | Hunger, thirst, stamina, cans, solar and wind charge by surface |
| `js/solar.js` | Panel placement, cable, and the fuselage plug |
| `js/turbine.js` | Turbine placement, spinning blades, and the tent or fuselage plug |
| `js/smurf.js` | Forest companion. Follows on foot. Runs home when the player boards |
| `js/groundfx.js` | Footprints, ripples, dust. Calls audio on each step |
| `js/audio.js` | Web Audio wind, steps, synthesized prop, one-shots |
| `js/loaders.js` | GLB and FBX loaders, human and Smurf setup |
| `index.html` | Canvas and HUD nodes `#ui-overlay`, `#meters`, `#prompt-overlay` |

Not imported by `main.js` today: `js/airport.js`, `js/takeoffManager.js`, `js/landingManager.js`, `js/taxiManager.js`, `js/landingAid.js`. Do not revive them unless a task says so.

## Assets

`models/` holds the Piper, packs, player clips, Smurf, and `Camp.glb` (not placed in the world yet). `audio/prop.mp3` is the recorded prop. `js/audio.js` still synthesizes the prop in `prop()`.

## World facts agents should not rediscover

- Spawn is `terrain.beachPark()` on the south beach, heading north into the trees.
- Coast radius is about 150 m. Interior height is low (a few meters), not a mountain island.
- Trunks and rocks are circles in a spatial grid. The player slides off them. The plane stops on them on the ground and is blocked in the air.
- Water deeper than about 1.2 m is swimming. The plane will not roll into water.
- Smurf home is forest inland of the beach park. Notice range is about 8 m.

## How to ask for a change

Name the files. Say what is out of scope. One feature per chat.

```text
In @js/audio.js only: loop audio/prop.mp3 and drive pitch and volume from the existing prop() inputs. Do not edit other files. Do not open a browser.
```

Questions and design stay in Ask or Plan. Implementation stays in Agent with `@` files attached. You playtest with `docs/VERIFY.md`. Do not ask the agent to screenshot the game unless you are stuck.
