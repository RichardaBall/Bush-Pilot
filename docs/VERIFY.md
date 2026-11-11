# Manual checks

You run the game. The agent does not open a browser unless you ask.

Serve the folder (any static server), open `index.html`, click the canvas once so pointer lock and audio start.

## Smoke (every change that touches `js/`)

- [ ] Page loads with no red errors in the console.
- [ ] You spawn on the south beach, plane nearby, facing the trees.
- [ ] WASD walks. Shift runs. Scroll zooms. The body hides when zoomed in close.
- [ ] `E` beside the parked plane boards. `E` again exits on the sand.
- [ ] Hold `W` in the plane: power rises, the prop sound changes, the plane rolls and lifts.
- [ ] `S` reduces power. A steep or wet touchdown shows the yellow hint and does not stick.

## Only if that system changed

**Water** (`player.js`, `terrain.js`, `groundfx.js`)

- [ ] Walking into the sea slows you, then you swim. The camera stays above the surface.
- [ ] Wet steps splash. Dry sand leaves prints. The plane will not taxi into the water.

**Smurf** (`smurf.js`, `loaders.js`)

- [ ] It is in the trees, moving, not frozen on the beach.
- [ ] Walk up to it on foot: it follows and stays a few steps back.
- [ ] Board the plane: it runs back toward the forest and does not follow the aircraft.

**Tent** (`tent.js`, `loaders.js`, `main.js`)

- [ ] On foot, middle click shows Tent. Left click starts placing. You cannot walk. Looking aims the ghost. Scroll rotates it and does not zoom.
- [ ] Left click on dry gentle ground places it. A wet spot or a trunk stays red and does not place. Middle click or Escape cancels.
- [ ] Walk up to it, middle click, Pack tent. It is gone and can be placed again. Scroll zooms again while walking.

**Field kit** (`fieldkit.js`, `solar.js`, `main.js`)

- [ ] Meters show hunger, thirst, stamina, and cans while on foot, and hide in the plane.
- [ ] `F` at the shore raises thirst and can count (until cargo is full).
- [ ] Middle mouse, Solar panel. It aims like the tent. A spot more than about 12 m from the parked plane stays red. Left click on dry gentle ground places it.
- [ ] Middle mouse, Run cable. Walk to the fuselage and click. Charge climbs only after it is plugged in. Unplug stops the charge. You cannot add power while the panel is out. In the cockpit, `G` packs it.
- [ ] Middle mouse, Wind turbine. A spot more than about 12 m from both the parked plane and the placed tent stays red. Left click on dry gentle ground places it, and the blades spin.
- [ ] Near it, Run cable to plane. Walk to the fuselage and click. Charge climbs day or night, faster in the open than under trees. Unplug turbine, or rolling the plane, stops it.
- [ ] Run cable to tent. Walk to the tent and click. At night the tent lights and the plane charge does not move. In daylight the tent stays dark.
- [ ] With that tent cable still in, also run the tent cable to the fuselage. At night the tent stays lit and the plane charge climbs. The light does not drain the battery. Packing the tent drops the turbine lead. You cannot add power while the turbine is out. In the cockpit, `G` packs it.

**Lamp and tent light** (`lamp.js`, `tentpower.js`, `main.js`)

- [ ] On foot, `L` lights a cool lamp in the right hand. The meter shows Lamp. It lights the ground when the body is hidden up close, and it goes out when you board. `L` again puts it out.
- [ ] Leave it on until the meter hits 0. It will not light again. The prompt says to charge it at the plane.
- [ ] At the parked plane, middle mouse, Charge lamp. A short lead runs to the lamp, Lamp climbs, and the plane charge falls. Walking away, boarding, or middle mouse stops it.
- [ ] Place the tent within about 12 m of the parked plane. Middle mouse, Run tent cable. Walk to the fuselage and click. At night the inside of the tent lights and the plane charge falls. In daylight the cable can stay plugged and the tent stays dark. Unplug, pack the tent, or roll the plane and the lead drops.

**Sound** (`audio.js`, `groundfx.js`)

- [ ] Wind is quieter under trees than on the open beach, and fades in the plane.
- [ ] Footsteps match the surface. Boarding clicks. Water pours. The panel flaps.
- [ ] After the prop MP3 task: the recorded loop follows power, and it is silent when parked with power off.

Stop at the first failure and paste the console line plus what you did. Do not ask for a full browser pass.
