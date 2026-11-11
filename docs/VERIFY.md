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
- [ ] The south shoreline shows the same shallow color and moving foam as the home beach. The channel between the islands stays deep.
- [ ] The south beach has scattered stones you can walk into. The home beach stones are unchanged.
- [ ] The south forest has banana trees, mushrooms, pineapple plants, the second flower, and loose bananas, coconuts, and pineapples. The home forest and the pond are unchanged.

**Smurf** (`smurf.js`, `loaders.js`)

- [ ] It is in the trees, moving, not frozen on the beach.
- [ ] Walk up to it on foot: it follows and stays a few steps back.
- [ ] Board the plane: it runs back toward the forest and does not follow the aircraft.

**Tent** (`tent.js`, `loaders.js`, `main.js`)

- [ ] On foot, middle click shows Tent. Left click starts placing. You cannot walk. Looking aims the ghost. Scroll rotates it and does not zoom.
- [ ] Left click on dry gentle ground places it. A wet spot or a trunk stays red and does not place. Middle click or Escape cancels.
- [ ] Walk up to it and press F. It packs away and can be placed again. Scroll zooms again while walking. If a cable is plugged in, the first F unplugs and the next F packs.

**Field kit** (`fieldkit.js`, `solar.js`, `main.js`)

- [ ] Meters show hunger, thirst, stamina, and cans while on foot, and hide in the plane.
- [ ] `F` at the shore raises thirst and can count (until cargo is full).
- [ ] Middle mouse, Solar panel. It aims like the tent. A spot more than about 12 m from the parked plane stays red. Left click on dry gentle ground places it.
- [ ] At the placed panel, press E. A cable follows you. Left click the parked plane or a placed battery. Charge climbs only after it is plugged in. A battery-to-plane click does nothing and says the cable does not fit. E or middle mouse cancels a loose cable. Press E again to unplug. You cannot add power while the panel is out. In the cockpit, `G` packs it.
- [ ] Middle mouse, Wind turbine. A spot more than about 12 m from both the parked plane and the placed tent stays red. Left click on dry gentle ground places it, and the blades spin.
- [ ] At the turbine, press E, then left click the parked plane. Charge climbs day or night when the wind is up, faster in the open than under trees. In a calm the blades stay still and nothing charges. Press E to unplug, or roll the plane, and it stops.
- [ ] Press E at the turbine, then left click the tent. At night the tent lights and the plane charge does not move. In daylight the tent stays dark.
- [ ] With that turbine cable still in the tent, press E at the tent once hunger is full, then left click the fuselage or a placed battery. At night the tent stays lit and that charge climbs. The light does not drain the plane when the wind is feeding the tent. The turbine can stay planted while you fly. Only the solar panel has to be packed before adding power. In the cockpit, `G` packs the panel.

**Lamp and tent light** (`lamp.js`, `tentpower.js`, `main.js`)

- [ ] On foot, `L` lights a cool lamp in the right hand. The meter shows Lamp. It lights the ground when the body is hidden up close, and it goes out when you board. `L` again puts it out.
- [ ] Leave it on until the meter hits 0. It will not light again. The prompt says to charge it at the plane.
- [ ] Middle mouse, Attach wire. Left click the parked plane or a placed battery. Lamp climbs and that charge falls. Walking away, boarding, or middle mouse stops it.
- [ ] At the placed tent, press E, then left click the parked plane or a placed battery. At night the inside of the tent lights and that charge falls. The battery drains faster than the plane. In daylight the cable can stay plugged and the tent stays dark. Press E to unplug. Packing the tent, or rolling the plane, drops the lead.

**Birds** (`birds.js`, `audio.js`, `main.js`)

- [ ] On the south beach by day, gulls circle a few meters up and their wings move.
- [ ] Walk up to one: it climbs and settles farther along the shore. A low pass in the plane does the same.
- [ ] Light the campfire. Two gulls drift into a ring around it, still above head height. Put the fire out and they return to the beach.
- [ ] A short chirp plays when you are near them by day. It is quieter in rain, and it is gone at night while they sit low.
- [ ] On the south island shore by day, gulls circle the same way. The Smurf is not there.
- [ ] A campfire on the south island draws those gulls in. The gulls on the home beach stay put.

**Fish** (`fish.js`, `main.js`)

- [ ] In the channel and off the south shore, rings spread on the water every few seconds. The home beach, forest, and home lake stay clear of them.
- [ ] Now and then a fish jumps: a tapered body, forked tail, and fin, then a ring where it lands. A quiet splash plays if you are close.

**Sound** (`audio.js`, `groundfx.js`)

- [ ] Wind is quieter under trees than on the open beach, and fades in the plane.
- [ ] Footsteps match the surface. Boarding clicks. Water pours. The panel flaps.
- [ ] After the prop MP3 task: the recorded loop follows power, and it is silent when parked with power off.

Stop at the first failure and paste the console line plus what you did. Do not ask for a full browser pass.
