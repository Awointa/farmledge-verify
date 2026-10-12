# Every state of the page

> ## ⚠ 01–29 AND 31–36 ARE SYNTHETIC. ONLY 00 AND 30 ARE REAL TESTNET ANCHORS.
>
> Screenshots **01–29** and **31–36** (`*-synthetic-*.png`) show the page answering from
> **synthetic test data**: fixture chains served to the unmodified page by the
> test harness in place of the RPC. Nothing in them was anchored on any
> network. Their warehouse (`FIXTURE_WH`), lots, receipts, lender, dates,
> ledger numbers and anchoring times are made up, and each image carries a
> purple **SYNTHETIC TEST DATA** banner and watermark.
>
> Only **00** and **30** (`*-live-testnet-*.png`) are real: the page checking
> the Testnet example against Stellar's test network. Even those are **not a
> real deposit**: the example lot is synthetic, anchored on a test network.
>
> **Never present a synthetic screenshot as a real anchor.** If one goes in a
> slide, keep its banner visible and say it is synthetic.

Made by `npm run screenshots` (`test/page.test.js`), at 390 px wide, against the
site exactly as deployed. The page itself has no test or demo mode; the banner
and watermark are added by the test harness.

## 00 · REAL (Testnet) · The Testnet example, checked against the real Testnet: verified; part pledged, part released

![00-live-testnet-testnet-example.png](00-live-testnet-testnet-example.png)

## 01 · SYNTHETIC · Landing page: the network banner, the trust distinction, input

![01-synthetic-landing.png](01-synthetic-landing.png)

## 02 · SYNTHETIC · Verified; one unencumbered receipt

![02-synthetic-ok-active.png](02-synthetic-ok-active.png)

## 03 · SYNTHETIC · Verified; part pledged, part free, part released

![03-synthetic-ok-pledged.png](03-synthetic-ok-pledged.png)

## 04 · SYNTHETIC · Verified; a lender has begun recovery (red banner above everything)

![04-synthetic-ok-recovery.png](04-synthetic-ok-recovery.png)

## 05 · SYNTHETIC · Verified; the whole lot released

![05-synthetic-ok-exited.png](05-synthetic-ok-exited.png)

## 06 · SYNTHETIC · Verified; the receipt revoked

![06-synthetic-ok-revoked.png](06-synthetic-ok-revoked.png)

## 07 · SYNTHETIC · Verified; a released receipt archived on the ledger, explained

![07-synthetic-ok-archived-receipt.png](07-synthetic-ok-archived-receipt.png)

## 08 · SYNTHETIC · Verified; no receipt issued for the lot

![08-synthetic-ok-no-receipt.png](08-synthetic-ok-no-receipt.png)

## 09 · SYNTHETIC · DAY_ROOT_EXPIRED: verified through the head chain, and why that is enough

![09-synthetic-day-root-expired.png](09-synthetic-day-root-expired.png)

## 10 · SYNTHETIC · Verified; the warehouse's head archived, read and matched

![10-synthetic-head-archived.png](10-synthetic-head-archived.png)

## 11 · SYNTHETIC · NOT_YET_ANCHORED: pending, not failed

![11-synthetic-not-yet-anchored.png](11-synthetic-not-yet-anchored.png)

## 12 · SYNTHETIC · DAY_ROOT_DIFFERS: altered or forged

![12-synthetic-forged-day-root-differs.png](12-synthetic-forged-day-root-differs.png)

## 13 · SYNTHETIC · HEAD_MISMATCH: root on chain but not chained (how backdating shows up)

![13-synthetic-unchained-head-mismatch.png](13-synthetic-unchained-head-mismatch.png)

## 14 · SYNTHETIC · HEAD_MISMATCH: a bundle missing its later days

![14-synthetic-stale-bundle-head-mismatch.png](14-synthetic-stale-bundle-head-mismatch.png)

## 15 · SYNTHETIC · NO_HEAD: nothing anchored this claim

![15-synthetic-no-head.png](15-synthetic-no-head.png)

## 16 · SYNTHETIC · PROOF_DOES_NOT_FIT

![16-synthetic-proof-does-not-fit.png](16-synthetic-proof-does-not-fit.png)

## 17 · SYNTHETIC · DAY_IN_FUTURE

![17-synthetic-day-in-future.png](17-synthetic-day-in-future.png)

## 18 · SYNTHETIC · BAD_BUNDLE: nothing was checked

![18-synthetic-bad-bundle.png](18-synthetic-bad-bundle.png)

## 19 · SYNTHETIC · COULD_NOT_CHECK: RPC refused

![19-synthetic-could-not-check-refused.png](19-synthetic-could-not-check-refused.png)

## 20 · SYNTHETIC · COULD_NOT_CHECK: RPC HTTP 500

![20-synthetic-could-not-check-http-error.png](20-synthetic-could-not-check-http-error.png)

## 21 · SYNTHETIC · COULD_NOT_CHECK: offline

![21-synthetic-could-not-check-offline.png](21-synthetic-could-not-check-offline.png)

## 22 · SYNTHETIC · WRONG_NETWORK: refused, nothing read

![22-synthetic-wrong-network.png](22-synthetic-wrong-network.png)

## 23 · SYNTHETIC · Progress while the lot's claims are read

![23-synthetic-claims-progress.png](23-synthetic-claims-progress.png)

## 24 · SYNTHETIC · Verified, but the claims could not be read

![24-synthetic-ok-claims-unreadable.png](24-synthetic-ok-claims-unreadable.png)

## 25 · SYNTHETIC · A tablet capture receipt QR: proves nothing

![25-synthetic-capture-receipt.png](25-synthetic-capture-receipt.png)

## 26 · SYNTHETIC · The post-sync slip leaf: a claim, not a proof

![26-synthetic-slip-leaf-unverified.png](26-synthetic-slip-leaf-unverified.png)

## 27 · SYNTHETIC · A deposit number typed in: not checkable

![27-synthetic-not-a-bundle.png](27-synthetic-not-a-bundle.png)

## 28 · SYNTHETIC · Warehouse anchoring record with a missed day

![28-synthetic-warehouse-gap.png](28-synthetic-warehouse-gap.png)

## 29 · SYNTHETIC · Warehouse anchoring record: no anchor

![29-synthetic-warehouse-none.png](29-synthetic-warehouse-none.png)

## 30 · REAL (Testnet) · Warehouse anchoring record for the Testnet example warehouse

![30-live-testnet-warehouse-record.png](30-live-testnet-warehouse-record.png)

## 31 · SYNTHETIC · A slip link on the deployed page, which has no proof API yet: the slip's reference, nothing fetched

![31-synthetic-slip-link-no-proof-api.png](31-synthetic-slip-link-no-proof-api.png)

## 32 · SYNTHETIC · Verified, and the deposit matches the slip's reference

![32-synthetic-slip-match.png](32-synthetic-slip-match.png)

## 33 · SYNTHETIC · SLIP_MISMATCH (page check): the proof is valid, and it is for a different deposit than the slip

![33-synthetic-slip-mismatch.png](33-synthetic-slip-mismatch.png)

## 34 · SYNTHETIC · A forged bundle with a slip that does not match: the verification failure comes first

![34-synthetic-slip-forged-failure-first.png](34-synthetic-slip-forged-failure-first.png)

## 35 · SYNTHETIC · A slip token fetched from a proof API (served by the harness: none is public yet)

![35-synthetic-slip-token-fetched.png](35-synthetic-slip-token-fetched.png)

## 36 · SYNTHETIC · A slip link with no reference: verified, and said to be uncompared with the slip

![36-synthetic-slip-link-no-reference.png](36-synthetic-slip-link-no-reference.png)
