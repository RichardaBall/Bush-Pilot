# Chat prompts

Copy one block. Attach the `@` files it names. Start a new Agent chat for the next row in `docs/ROADMAP.md`.

## One file

```text
In @js/audio.js only: loop audio/prop.mp3 and drive pitch and volume from the existing prop() inputs. Silent when parked, power off, and speed under 0.8. Do not edit other files. Do not open a browser. I will listen using docs/VERIFY.md.
```

## Question, no edits

```text
Read @js/aircraft.js. How does a rejected landing work? Do not change any files.
```

## Plan, then a later chat implements one todo

```text
Plan only. Place models/Camp.glb inland of the beach park on dry forest ground. List the files and the smallest first todo. Do not edit code.
```

Then, in a new Agent chat:

```text
Implement only the first todo from the camp plan. Allowed files: the ones that todo names. Out of scope: flight, Smurf, audio, a second island. Do not open a browser.
```

## Do not send these unless you mean a long run

- "Implement the plan, don't stop."
- "Thoroughly explore the codebase."
- "Verify everything in the browser."
