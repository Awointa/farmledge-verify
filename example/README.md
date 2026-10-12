# The Testnet example

`testnet-example.bundle.json` is a real anchor on Stellar's test network.
**It is not a real deposit.** The warehouse, lot and owner were made up for
the example by `make_testnet_example.py`, run once on 2026-10-12.

| | |
|---|---|
| network | Stellar Testnet |
| contract | `CBW6TA5UJMXJY2VYPJV6WUVWNUP3PKZNPXFMC2CNVCWZDF3SKIT4UAIN` |
| warehouse | `TESTNET_EXAMPLE_WH` |
| day anchored | 20737 (2026-10-11 UTC), 4 leaves |
| lot | deposit number 1, `TESTNET-EXAMPLE-LOT-0001`, 4,000 kg |
| receipts | 72 (2,400 kg, active), 73 (1,200 kg, pledged), 74 (400 kg, exited) |

`testnet-example.log.json` records the anchor's root and head and each step.

## Keys

The script signs with these stellar-cli keystore identities. **All are
Testnet-only keys. Never reuse any of them, or anything derived from them,
on mainnet.**

| identity | role | address |
|---|---|---|
| `farmledge-admin` | contract admin (registers the warehouse) | `GBCF56H2FW3JOTAJFNPX6MROJSXSLNGMID3EXXAMDE6BANFOVR3XQKLR` |
| `fl-custodian` | custodian (anchors, mints, signs the exit) | `GATPEXERGDLT62BCYGQ66GEYGBIQIQUZVGNGEOBF34MPQ2I5WYVUEPXK` |
| `fl-verifier` | verifier (countersigns the mint) | `GCVI5WKCQNI7NUQVJARBAPBN52BXMXWLEBWETE6W5DBTO6KTIFIGAVE5` |
| `fl-tn-lender` | lender (accepts the pledge) | `GC5GFNR6Q7ZJ5ABKKJT6VMOV7KQMNU5GNIRJJ44GH244V2Q4EAUTRT4Z` |
| `fl-example-owner` | the lot's owner; **created for this example** | `GA6PRGLK747AYCVGPWLNUSNSP2CASS2UTEVIZ46DO6Q6SY46JQKR5YSW` |

stellar-cli keeps these secrets, unencrypted, in `~/.config/stellar/identity/`.
