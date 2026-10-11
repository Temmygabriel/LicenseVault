# Real-state screenshots

Produced by `npm run ui:capture` (`tools/ui-capture.mjs`), which drives the real UI over the
Chrome DevTools Protocol: it waits for React to hydrate, types an address, submits the form, waits
for the state machine to settle, **asserts the state is the one the scene claims**, and only then
captures. Nothing here is assembled for the picture, and a scene that settles on the wrong state
is refused rather than written.

| File | Status | State |
|---|---|---|
| `desktop-locked.png` | present | LOCKED — the state before any question has been asked. |
| `mobile-locked.png` | present | LOCKED — the state before any question has been asked. |
| `narrow-locked.png` | present | LOCKED — the state before any question has been asked. |
| `desktop-verified.png` | present | LICENSE VERIFIED — the recorded holder of licence token #73227. |
| `mobile-verified.png` | present | LICENSE VERIFIED — the recorded holder of licence token #73227. |
| `desktop-no-license.png` | present | NO LICENSE — an address the condition evaluated and returned false for. |
| `mobile-no-license.png` | present | NO LICENSE — an address the condition evaluated and returned false for. |
| `desktop-verification-error.png` | present | VERIFICATION ERROR — the same holder address against a server whose RPC is unreachable. Note it does NOT say NO LICENSE: an unreachable dependency is not a statement about rights. |
| `desktop-proof.png` | present | PROOF RECEIPT — read from the committed run, not typed in: the verifier's own counts and the six transaction links re-checked against Aeneid. |

## The error state needs a second server, on purpose

`desktop-verification-error.png` is a real infrastructure failure, not a mocked one. It is
captured against a server started with an unreachable RPC:

```
STORY_RPC_URL=http://127.0.0.1:9 npm start -- -p 4174
node tools/ui-capture.mjs http://localhost:4174/ qa-screens verification-error
```

The tool refuses to produce that scene against a healthy server, and refuses the others against
an unhealthy one — a screenshot of a state the app cannot actually produce is a drawing.