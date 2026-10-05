# UX TEST

**Project:** LicenseVault
**Last updated:** 2026-10-05

---

## Purpose

Build-spec §26 requires testing whether a stranger can understand the product. It also
requires: **do not manufacture positive results.**

**This test has not been run yet.** The product surfaces do not exist — BUILD 6 and BUILD 7
are not started, and BUILD 2's protocol gate has not passed. There is nothing meaningful for
a stranger to look at, so no result is recorded here.

---

## The three questions (to be asked of a real person)

| # | Question | Pass condition |
|---|---|---|
| 1 | In 5 seconds, what does this thing do? | They say something like "it locks a file until you have the licence" — not "it's a blockchain app" |
| 2 | In 30 seconds, what is the relationship between the licence and the access? | They can explain that holding the licence is what allows reading |
| 3 | Why did access change? | They can point at the licence being obtained, not at a button being pressed |

A failure on #2 or #3 is a **design failure**, not a tester failure. It means the mechanism
is not visible enough in the interface, which is a scored category in the visual gate.

---

## Anti-patterns to watch for in answers

If a tester says any of these, the interface is miscommunicating:

- "It's like an NFT thing" — the token is not the story; the *access* is.
- "It stores legal documents" — the product is not a document store.
- "The AI checks your licence" — there is no AI in this system. If the design implies one,
  it is lying about the mechanism.
- "It says verified but I don't know why" — the proof surface has failed its job.

---

## Test protocol (when there is something to test)

1. Recruit someone with no prior context. Not the builder. Not anyone who has read this repo.
2. Show the landing surface for 5 seconds, then hide it. Ask question 1.
3. Show it again, let them explore freely for 30 seconds. Ask question 2.
4. Walk them through a real access transition on the live deployment. Ask question 3.
5. Record their **actual words**, including the wrong ones.
6. Ask whether they could tell the difference between "you have no licence" and "we could
   not check" — this is the failure-semantics test, and it is the one most likely to fail.

---

## Results

| Date | Tester | Q1 | Q2 | Q3 | Notes |
|---|---|---|---|---|---|
| — | — | — | — | — | not yet run |

**No result will be entered here until a real person has actually been tested.** A blank
table is the honest state.
