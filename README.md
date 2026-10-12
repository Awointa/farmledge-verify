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

4. **Run it, choosing the RPC endpoint yourself:**

   ```
   python3 verify_proof.py bundle.json --rpc https://soroban-testnet.stellar.org
   ```

   Always pass `--rpc`. The RPC endpoint is the one thing the check trusts,
   and a forged bundle could name a server that lies. For mainnet, pick a
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

   The exit status is 0 only for the two verified results.

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

Static files, with no build step and no runtime dependency (see "Why no
library" below). It reads only from a public Soroban RPC endpoint, always
the one it is configured with and never one a bundle names, and it refuses
a bundle for any contract other than the one it is configured for. The
verification result is computed in your browser; no server computes or
reports it.

The page lives in `index.html` and `src/`. It is not built yet (checkpoint 3).

## Development

```
npm ci
npm test                 # all tests, including the conformance test
node test/mutate.js      # the mutation pass
npm run test:live        # against the real Testnet
```

Node 22 or later, and Python 3 for the conformance test.

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
`verify_proof.py` line by line. That keeps the page under 20 KB for a
mid-range phone on 3G, against about 113 KB gzipped for the Stellar SDK's
core. The SDK is still used, in the tests, to check that encoding
independently (`test/xdr.test.js`).

## License

Apache 2.0, as farmledge-protocol.
