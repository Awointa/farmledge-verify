# Every state of the page

Made by `npm run screenshots` (`test/page.test.js`) at 390 px wide. Except `00` and `30`, which ran against the real Testnet, every screenshot is the page answering from a **test fixture's chain**, served in place of the RPC by the test harness: synthetic data, not a real or Testnet deposit. The page itself has no test or demo mode.

## 00-testnet-example-live

The Testnet example, checked against the real Testnet: OK, part pledged, part released

![00-testnet-example-live](00-testnet-example-live.png)

## 01-landing

Landing page: the network banner, the trust distinction, input

![01-landing](01-landing.png)

## 02-ok-active

Verified; one unencumbered receipt

![02-ok-active](02-ok-active.png)

## 03-ok-pledged

Verified; part pledged, part free, part released

![03-ok-pledged](03-ok-pledged.png)

## 04-ok-recovery

Verified; a lender has begun recovery (red banner above everything)

![04-ok-recovery](04-ok-recovery.png)

## 05-ok-exited

Verified; the whole lot released

![05-ok-exited](05-ok-exited.png)

## 06-ok-revoked

Verified; the receipt revoked

![06-ok-revoked](06-ok-revoked.png)

## 07-ok-archived-receipt

Verified; a released receipt archived on the ledger, explained

![07-ok-archived-receipt](07-ok-archived-receipt.png)

## 08-ok-no-receipt

Verified; no receipt issued for the lot

![08-ok-no-receipt](08-ok-no-receipt.png)

## 09-day-root-expired

DAY_ROOT_EXPIRED: verified through the head chain, and why that is enough

![09-day-root-expired](09-day-root-expired.png)

## 10-head-archived

Verified; the warehouse's head archived, read and matched

![10-head-archived](10-head-archived.png)

## 11-not-yet-anchored

NOT_YET_ANCHORED: pending, not failed

![11-not-yet-anchored](11-not-yet-anchored.png)

## 12-forged-day-root-differs

DAY_ROOT_DIFFERS: altered or forged

![12-forged-day-root-differs](12-forged-day-root-differs.png)

## 13-unchained-head-mismatch

HEAD_MISMATCH: root on chain but not chained (backdating)

![13-unchained-head-mismatch](13-unchained-head-mismatch.png)

## 14-stale-bundle-head-mismatch

HEAD_MISMATCH: a bundle missing its later days

![14-stale-bundle-head-mismatch](14-stale-bundle-head-mismatch.png)

## 15-no-head

NO_HEAD: nothing anchored this claim

![15-no-head](15-no-head.png)

## 16-proof-does-not-fit

PROOF_DOES_NOT_FIT

![16-proof-does-not-fit](16-proof-does-not-fit.png)

## 17-day-in-future

DAY_IN_FUTURE

![17-day-in-future](17-day-in-future.png)

## 18-bad-bundle

BAD_BUNDLE: nothing was checked

![18-bad-bundle](18-bad-bundle.png)

## 19-could-not-check-refused

COULD_NOT_CHECK: RPC refused

![19-could-not-check-refused](19-could-not-check-refused.png)

## 20-could-not-check-http-error

COULD_NOT_CHECK: RPC HTTP 500

![20-could-not-check-http-error](20-could-not-check-http-error.png)

## 21-could-not-check-offline

COULD_NOT_CHECK: offline

![21-could-not-check-offline](21-could-not-check-offline.png)

## 22-wrong-network

WRONG_NETWORK: refused, nothing read

![22-wrong-network](22-wrong-network.png)

## 23-claims-progress

Progress while the claims are read

![23-claims-progress](23-claims-progress.png)

## 24-ok-claims-unreadable

Verified, but the claims could not be read

![24-ok-claims-unreadable](24-ok-claims-unreadable.png)

## 25-capture-receipt

A tablet capture receipt QR: proves nothing

![25-capture-receipt](25-capture-receipt.png)

## 26-slip-leaf-unverified

The post-sync slip leaf: a claim, not a proof

![26-slip-leaf-unverified](26-slip-leaf-unverified.png)

## 27-not-a-bundle

A deposit number typed in: not checkable

![27-not-a-bundle](27-not-a-bundle.png)

## 28-warehouse-gap

Warehouse anchoring record with a missed day

![28-warehouse-gap](28-warehouse-gap.png)

## 29-warehouse-none

Warehouse anchoring record: no anchor

![29-warehouse-none](29-warehouse-none.png)

## 30-warehouse-live

Warehouse anchoring record for the Testnet example warehouse, live

![30-warehouse-live](30-warehouse-live.png)
