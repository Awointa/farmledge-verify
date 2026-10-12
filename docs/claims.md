# What this page says about Farmledge, and the evidence for each

**The rule.** Every sentence the page says about what Farmledge, a warehouse
or anyone else in the system does must be true of the **deployed system
today**. Planned, merged-but-not-deployed, or configured-but-mocked does not
count.

**How it is enforced.** `test/copy-claims.test.js` reads every text node of
`index.html` and every string in `src/render.js` and `src/app.js`. It fails,
and so does CI:

- if a sentence that mentions Farmledge, a warehouse, a farmer, a slip,
  anchoring, sending or printing (`ABOUT_THE_SYSTEM` in
  `test/support/copy.js`) is not quoted below, word for word, on a `> ` line;
- if a quote below is no longer on the page;
- if a capability claim has no evidence, no "false when" or no date checked;
- if the page's copy changes at all, until the hash below is updated.

**On any change to the copy:** re-check each capability claim against the
deployed system, not against the code or a plan. Update its evidence and
date, or rewrite the sentence. Then set the new hash, which the failing test
prints.

copy-sha256: 7430799b5dd4436c67102e85c635ed3f3d6e1ba511d4fdd63da52466390fbdc6

"The deployed system", as of the last check:

- **Chain:** contract `CBW6TA5UJMXJY2VYPJV6WUVWNUP3PKZNPXFMC2CNVCWZDF3SKIT4UAIN`
  on Stellar Testnet.
  - Between ledgers 5,037,415 and 5,158,374 (the public RPC's window on
    2026-10-12), its only `anchored` events are FL_TN_ACTIVE ×3, FL_TN_IDLE ×3
    and TESTNET_EXAMPLE_WH ×1 (this site's example).
  - The warehouse registrations in that window are those three.
- **Backend:** farmledge-app has no deployment.
  - It has no deploy workflow: `.github/workflows/ci.yml` only.
  - Its proof links point at `PROOF_LINK_BASE_URL=http://localhost:3000/p` in
    `.env.example`.
  - `SMS_GATEWAY` accepts only `mock` (`src/config/schema.ts:137`, main
    `cd0e2e8`).
  - The operator reports 6 anchors and 0 proof bundles delivered on Testnet
    (2026-10-12).
- **This page:** https://awointa.github.io/farmledge-verify/, built by
  `scripts/build-site.sh`. `NETWORK.proofApi` is null.

## Capability claims

### Farmledge does not deliver proof bundles today

> Farmledge has no way to give you one yet.
> It does not send proof bundles to farmers today: its text-message sending is a placeholder that only writes to a log, and no bundle has been delivered to a farmer.

- **Where:** `src/render.js` `howToGetBundle`, under a capture receipt and a
  slip leaf. This replaced "the farmer is sent the proof bundle for this
  deposit by SMS link", which was false.
- **Evidence:**
  - `SMS_GATEWAY` can only be `mock`, which logs (farmledge-app
    `src/config/schema.ts:137`).
  - There is no deployed API to serve a bundle link: no deploy workflow, and
    the link base is `localhost`.
  - The operator reports 0 proof bundles delivered on Testnet (2026-10-12).
- **False when:** a real SMS gateway is configured and the proofs job has
  delivered a bundle on the deployed system. Then say how, and how soon.
- **Checked:** 2026-10-12

### This page fetches nothing from Farmledge while no address is set

> This page has no Farmledge address set to fetch the bundle the link names, so nothing was fetched.

- **Where:** `src/app.js` `fromToken`.
- **Evidence:** `NETWORK.proofApi` is `null` in `src/config.js`.
  `test/page.test.js` ("a slip link on the deployed page…") opens a slip link
  against the built site and checks that nothing is requested beyond the page
  and the RPC.
- **False when:** `proofApi` is set. The sentence is then not shown, so
  nothing needs to change here; but the address must be Farmledge's
  deployed API.
- **Checked:** 2026-10-12

### A record can only be revoked by the contract's admin

> revoked by the contract admin: void
> Voided by the contract admin; it confers nothing.

- **Where:** `src/render.js` claims ledger, for a receipt with status 4.
- **Evidence:** `revoke` calls `admin::require_admin` (farmledge-protocol
  `contracts/receipt/src/lib.rs:205-206`). That is the deployed contract's
  code: data_version 3, `deployments/testnet.json`.
- **False when:** the contract lets anyone else revoke. The sentence
  deliberately does not say who holds the admin key.
- **Checked:** 2026-10-12

### Recovery is begun by the lender

> A lender has begun recovery against part of this lot.

- **Where:** `src/render.js`, the red banner, shown when any receipt of the
  lot has status 2.
- **Evidence:** `start_recovery` moves `Locked -> Recovery` and is "Lender
  only" (`contracts/receipt/src/lib.rs:377-380`).
- **False when:** the contract lets anyone else start recovery.
- **Checked:** 2026-10-12

### A day's root stays on the ledger 30 days; the head chain keeps every day

> The day's own root has left the ledger after 30 days, by design, so its anchoring ledger and time are no longer readable from it.
> Day roots stay on the ledger for 30 days; older days are committed in the warehouse's head chain, which this record does not unpack.
> ), is a hash chain over every day it has anchored, this one included, and was reproduced exactly from this record.

- **Where:** `src/render.js` anchor block and warehouse record.
- **Evidence:**
  - `DAY_ROOT_TTL = 30 * DAY_IN_LEDGERS` in temporary storage
    (`contracts/receipt/src/storage.rs:26`, `:202`).
  - The head is `sha256(prev ‖ day ‖ leaves ‖ root)`, appended to on every
    anchor (`docs/events.md`, `anchored`).
  - The page recomputes the head from the bundle and compares it with the
    head on the ledger: conformance fixtures `valid-root-expired`,
    `unchained-root`.
- **False when:** the contract's TTL or head construction changes.
- **Checked:** 2026-10-12

### The Testnet example is a real anchor

> : a real anchor on Stellar's test network.
> Testnet example: a real anchor on Stellar's test network.

- **Where:** `index.html`, and the banner over the example's result.
- **Evidence:** TESTNET_EXAMPLE_WH's `anchored` event is at ledger 5,154,231.
  The example verifies `RESULT OK` with
  `python3 scripts/verify_proof.py example/testnet-example.bundle.json --rpc https://soroban-testnet.stellar.org`
  (2026-10-12), and CI's live job runs it on every push.
- **False when:** Testnet is reset, or the example is re-anchored without
  regenerating the bundle. CI's live job would then fail.
- **Checked:** 2026-10-12

### The standalone script is the protocol's, and published

> The script is byte for byte the protocol's own scripts/verify_proof.py (pinned by SHA-256), and is printed in full in the protocol's public specification, docs/events.md.

- **Where:** `index.html`, "Verify this yourself".
- **Evidence:**
  - `test/fixtures.test.js` checks the shipped file against
    `scripts/verify_proof.pin.json`.
  - CI's live job compares it with farmledge-protocol at the pinned commit.
  - At `3f731e8`, the one `python` block in `docs/events.md` is identical to
    the file. farmledge-protocol is public.
- **False when:** the protocol's script changes and this copy is not
  re-pinned. CI fails.
- **Checked:** 2026-10-12

### The result is computed here, by nothing of Farmledge's

> It checks the claim against the Stellar ledger, in your browser, and reads nothing else: no Farmledge server computes or reports the result.
> This page does not take Farmledge's word for anything.
> Static files, no server, no tracking.

- **Where:** `index.html`.
- **Evidence:**
  - `test/page.test.js` asserts that every state contacts only the page's
    host and the configured Stellar RPC.
  - The token fetch goes to Farmledge for the bundle, a claim, and is then
    verified here: "the slip reference is never sent anywhere".
  - The site is the static files in `scripts/build-site.sh`, on GitHub Pages.
- **False when:** any result, or part of one, is read from a Farmledge
  server.
- **Checked:** 2026-10-12

## Said only when the ledger, or what was given to the page, shows it

Each of these describes the chain state the page has just read, or the input
in front of it. Each is shown only in the state that makes it true, and the
render tests (`test/render.test.js`, `test/slip.test.js`) pin which states
those are.

From the verification, or the warehouse's entries on the ledger:

> the warehouse
> , exactly as the warehouse committed them on Stellar.
> Verified through the warehouse's chain of commitments
> has not anchored its books for
> The warehouse has not anchored since ….
> Not chained: this record is not in the warehouse's committed history
> (The bundle may also just be out of date: it lacks the anchors after its day.
> Nothing anchored this claim
> No anchor stands behind this record.
> No anchor can exist for it.
> , chained to that warehouse's commitments today; and the lot's current claims as the ledger holds them now.
> The warehouse's head on Stellar today,
> (last anchored day
> The warehouse's head entry is archived on the ledger (its storage rent has lapsed).
> This says how a warehouse has committed its books to the ledger.
> No anchor on the ledger for
> Either this warehouse has never committed its books, or the id is not exactly right: ids are case-sensitive.
> · nothing anchored in the … day(s) since

From the lot's receipts on the ledger:

> No receipt has been issued on the ledger for this lot.
> in recovery by lender
> pledged to lender
> Each receipt issued from it is a claim; here they all are.
> released: recorded on the ledger as having left the warehouse

From the slip link, or its absence. Nothing here says what a slip looks
like: no deployed system prints slip references yet (farmledge-app's reprint
is on branch `feat/app-proof-slip`):

> Only your own comparison with the slip guards against a swapped bundle.
> It is the deposit your slip's QR code names.
> Your slip's QR code names deposit
> The same lot, but this is its … record, not the deposit on your slip.
> The link's slip reference could not be read
> is not in the form WAREHOUSE.NUMBER), so this page could not compare this proof with your slip.
> The link carried no slip reference, so this page could not compare this proof with your slip.
> No slip reference came with this bundle, so this page could not compare it with a slip.
> This proof is valid, and it is for a different deposit than your slip
> , but your slip is for deposit
> The link's slip reference could not be read, so no bundle can be compared with your slip.
> The link carried no slip reference, so no bundle can be compared with your slip.
> fetched from Farmledge with the token in your slip's link, at

From Farmledge's answer to a token fetch. These are never shown while
`proofApi` is null:

> Fetching the bundle from Farmledge…
> Farmledge did not answer within … seconds, so nothing was fetched.
> The bundle could not be fetched from Farmledge: no answer.
> Farmledge has no proof for the token in this link.
> Farmledge is refusing requests: too many were made.
> The bundle could not be fetched from Farmledge (HTTP …).

From the form of the input. A `farmledge:capture:` payload, or a bare leaf,
is named by its form; the page does not claim to know who made it, and says
it is not checked:

> This is a capture receipt from a tablet that had not yet synced.
> Nothing has been anchored for this deposit yet.
> Tablet reference:
> This is a deposit record in the form Farmledge uses.
> The record as given:
> Day recorded
> The file is not a well-formed Farmledge proof bundle, so it could not be checked at all.

## Not claims: names, labels, instructions, and what this page does

> Farmledge Verify
> Check a warehouse proof against the ledger
> A Farmledge proof bundle is Farmledge's claim about a deposit.
> Warehouse anchoring record
> Check whether a warehouse commits its books to the ledger, and how regularly.
> Warehouse id
> Warehouse
> Lender
> Anchored in ledger
> Where it is anchored
> Has anchored
> Last anchored day
> Reading the warehouse's receipts from the ledger: ……
> Reading the warehouse's receipts from the ledger…
> Compare the warehouse and deposit reference in the output with the ones printed on the slip.
> The script cannot do this for you: it never sees your slip.
> For the Testnet example the line above the result reads lot 1, kind 0, in TESTNET_EXAMPLE_WH's books: as a slip reference, that deposit is TESTNET_EXAMPLE_WH.1.
> The warehouse and the lot number must both match, and the kind must be 0, a deposit.
> The page and its tests are open source: github.com/Awointa/farmledge-verify, Apache 2.0.
> that the grain is physically in the warehouse
> Those rest on the warehouse and on your own diligence.
> A ledger record is evidence of what was recorded, not of what is in the store.
> Check again after the warehouse next anchors its books: its anchoring record, below, shows when it has anchored so far.
> Check this matches the deposit number printed on the slip.
> Do not accept it for the deposit on your slip: ask for the proof of that deposit.
> Verifier result:
> Slip check:
> The standalone script never sees your slip, so it cannot make this check.
> This page checks Farmledge proof bundles.
> A deposit number or a slip reference cannot be checked against the ledger: it carries no record and no proof.
> Paste or upload the proof bundle for this deposit: it will be checked against the ledger, and compared with your slip.
> A warehouse id is 1 to 32 letters, digits or underscores, exactly as the warehouse uses it.
