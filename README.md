# farmledge-verify

Check a Farmledge proof bundle against the Stellar ledger, without trusting
Farmledge.

A **proof bundle** is Farmledge's *claim* that a deposit was in a warehouse's
books on a given day. It can reach you any way at all: from the farmer, by
SMS link, or downloaded from a Farmledge server. That does not weaken the
check, because the check reads only the chain. If the bundle's contents do
not hash into a root that the warehouse committed on Stellar, and that root
is not chained to the head stored on chain today, the check fails. Farmledge
cannot make a false bundle pass, and cannot have rewritten a day's books
after they were committed.

This repository holds two verifiers that implement the same algorithm and
are tested against each other:

- `scripts/verify_proof.py`: a standalone script, Python standard library
  only. Use it if you don't want to rely on any web page, including ours.
- `src/`: the same check, run in the browser by the verification page.

## Verify a bundle yourself, with Python and nothing else

You need Python 3.8 or later and an internet connection. Nothing to install.

1. **Get the script.** Download
   [`scripts/verify_proof.py`](scripts/verify_proof.py). It is about 190
   lines; read it, it is meant to be read. Check it is the published
   version:

   ```
   python3 -c "import hashlib; print(hashlib.sha256(open('verify_proof.py','rb').read()).hexdigest())"
   ```

   This must equal `sha256` in [`scripts/verify_proof.pin.json`](scripts/verify_proof.pin.json),
   which also names the farmledge-protocol commit it comes from. The same
   script is printed in full in farmledge-protocol's `docs/events.md`.

2. **Get the bundle**, a `.json` file, from whoever gave you the proof.

3. **Check which contract it names.** Open the file and find
   `"contract_id"`. It must be the published Farmledge deployment:

   | network | contract |
   |---|---|
   | Stellar Testnet | `CBW6TA5UJMXJY2VYPJV6WUVWNUP3PKZNPXFMC2CNVCWZDF3SKIT4UAIN` |
   | Stellar mainnet | not deployed yet |

   Testnet is Stellar's test network. **A Testnet proof is not a real
   deposit.** If the contract is anything else, stop: the bundle is not
   checkable against Farmledge's books.

4. **Run it. `--rpc` is required: you choose the endpoint.**

   ```
   python3 verify_proof.py bundle.json --rpc https://soroban-testnet.stellar.org
   ```

   The RPC endpoint is the one thing the check trusts. The bundle's own
   `rpc` field is shown as a suggestion ("the bundle suggested …, not
   used") and never dialled, so a forged bundle naming a server that lies
   is visible, not obeyed. For mainnet, pick a
   provider from
   [Stellar's RPC provider list](https://developers.stellar.org/docs/data/apis/rpc/providers),
   or run your own.

5. **Read the last line.** It is always `RESULT <CODE>`:

   | result | means |
   |---|---|
   | `OK` | **Verified.** The deposit is in the warehouse's books for that day, as committed on chain. |
   | `DAY_ROOT_EXPIRED` | **Verified**, through the chain of daily commitments alone. A day's own root leaves the chain after 30 days, by design. |
   | `NOT_YET_ANCHORED` | **Not a failure.** The warehouse has not committed that day yet. Check again after the next nightly anchor. |
   | `DAY_ROOT_DIFFERS` | **Fails.** The books committed for that day are not the ones in this bundle: altered or forged. |
   | `HEAD_MISMATCH` | **Fails.** The bundle's chain of days does not reach the commitment on chain. |
   | `PROOF_DOES_NOT_FIT` | **Fails.** The proof cannot belong to that day's books. |
   | `DAY_IN_FUTURE` | **Fails.** The bundle claims a day that has not happened yet. |
   | `NO_HEAD` | **Fails.** That warehouse has never committed anything on chain. |
   | `BAD_BUNDLE` | Not a proof bundle. |
   | `COULD_NOT_CHECK` | **No result.** The chain could not be read. This says nothing about the bundle; try again or try another RPC. |
   | `NO_RPC` | Nothing was checked: `--rpc` is missing. |

   Exactly two results count as verified, here and on the page: `OK` and
   `DAY_ROOT_EXPIRED`. The exit status is 0 for those two only.
   `NOT_YET_ANCHORED` is not verified: it means nothing has been committed
   for that day yet, so the slip cannot be checked either way.

   **Why `DAY_ROOT_EXPIRED` is enough.** The head stored on chain today is a
   SHA-256 hash chain over every day the warehouse has anchored (day, leaf
   count, root), and the contract only ever appends to it. A root that,
   followed by the later days, recomputes exactly to today's head is
   therefore the root committed for that day: producing a different one that
   does would mean breaking SHA-256.

   **Archived entries.** Stellar archives an entry whose rent has lapsed.
   RPC still returns an archived entry, with its value, and that value is
   what is read and compared: archived is not the same as missing, and not
   the same as invalid. (stellar-rpc returns archived entries with
   `liveUntilLedgerSeq` 0; see `cmd/stellar-rpc/internal/ledgerentries/main.go`.)

### What a verified result shows, and what it does not

It shows that this bundle's contents (lot, owner address, weight, grade,
the custodian and verifier addresses) hash into a root that the warehouse
committed on chain for that day, and that the committed books cannot have
been changed since.

It does **not** show that the grain is physically in the warehouse, that
the weight was measured correctly, that the grade is accurate, or that the
people behind the addresses are who they say they are. Those rest on the
warehouse, its audits and your own diligence. A deposit proof is also not
the lot's *current* state: whether the lot has since been pledged,
released or revoked is a separate chain read, which the verification page
does and the script does not.

## The page

`index.html`, `style.css`, `src/` and `fonts/`: static files, no build step,
no server, no runtime dependency. It accepts a bundle pasted, uploaded,
scanned from a QR code, carried in a link (`#bundle=<base64url>`, never sent
to any server) or fetched from a URL (`?src=https://…`), and always says
which. It recognises the two QR forms printed on counter slips today (a
tablet capture receipt, and the post-sync leaf) and explains them; neither
is checked, because neither carries a proof.

- **One network, shown on every screen.** It checks Stellar Testnet,
  contract `CBW6TA5U…KIT4UAIN` (`src/config.js`), and refuses outright a
  bundle naming any other contract.
- **The endpoint is configuration.** Every chain read goes to the RPC in
  `src/config.js`. The bundle's `rpc` is shown as a suggestion and never
  dialled.
- **Verified means exactly `OK` or `DAY_ROOT_EXPIRED`,** computed in the
  browser. Every verified result states what was and was not checked beside
  the tick. "Could not check" is never rendered as a result.
- **A lot's claims, not a status.** One row per receipt issued from the
  lot, with weight and state (unencumbered, pledged, in recovery, released,
  revoked) and a summary in kilograms. Recovery is a red banner above
  everything. Loan references are never shown (farmledge-protocol#12).
- **Warehouse anchoring record:** whether a warehouse has a head, its day
  roots still on the ledger, and any gaps. It says nothing about any
  deposit.

Screenshots of every state: [`docs/screenshots/`](docs/screenshots/).

## Development

```
npm ci
npm test                 # all tests, including the conformance test
node test/mutate.js      # the mutation pass
npm run test:live        # against the real Testnet, including the page
npm run screenshots      # docs/screenshots/, every state of the page
```

Node 22 or later, Python 3 for the conformance test, and Chrome or Playwright's Chromium for the page test.

**Conformance** (`test/conformance.test.js`) is the most important test
here. Every fixture in `test/fixtures/` (valid, tampered leaf, path, index
and day chain, wrong root, unchained root, not yet anchored, expired,
archived, malformed in many ways, and every way the RPC can fail) goes
through both the browser verifier and `verify_proof.py`, each against a
stand-in RPC serving the fixture's chain. Both must give the same outcome,
including which failure. The fixtures are built by `test/make-fixtures.js`
with the Stellar SDK, a third implementation independent of both.

**Mutations** (`test/mutate.js`): every check in the browser verifier and
its chain reads is removed in turn, and the suite must fail each time. A
check no test catches is not a check.

**The Testnet example** (`example/`) is a real anchor and mint on Stellar's
test network, made by `example/make_testnet_example.py` with synthetic
identifiers. It is not a real deposit. `test/live.test.js` checks daily that
it still verifies in both verifiers.

### Why no library

The page needs only SHA-256 (built into browsers) and a small subset of
Stellar's XDR, which `src/xdr.js` writes out by hand to mirror
`verify_proof.py` line by line. The page's code is about 24 KB gzipped, plus
82 KB of self-hosted fonts that swap in after the text has rendered,
against about 113 KB gzipped for the Stellar SDK's core alone. The SDK is
still used, in the tests, to check that encoding independently:
`test/xdr.test.js`, and `test/fuzz.test.js`, which encodes 10,000 random
leaves per seed (a fixed one and a random one, every CI run) with the
hand-rolled code, the SDK and `verify_proof.py`, and fails on any byte of
difference, printing both hex dumps.

## License

Apache 2.0, as farmledge-protocol.
