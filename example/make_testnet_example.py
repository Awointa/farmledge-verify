#!/usr/bin/env python3
"""How example/testnet-example.bundle.json was made: one synthetic lot,
really anchored and minted on Stellar's Testnet, then partly pledged and
partly exited so its receipts show every common claim.

Run once, by whoever holds the deployment's Testnet admin, custodian,
verifier and lender keys in the stellar CLI keystore. It is kept so the
example's provenance can be read and re-run; the page never runs it.

    python3 example/make_testnet_example.py

Nothing in it is a real deposit. The warehouse, deposit id and owner are
made up for the purpose and named so nobody can mistake them for real ones.
"""
import json, os, subprocess, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import verify_proof as vp  # noqa: E402

NETWORK, RPC = "testnet", "https://soroban-testnet.stellar.org"
CONTRACT = "CBW6TA5UJMXJY2VYPJV6WUVWNUP3PKZNPXFMC2CNVCWZDF3SKIT4UAIN"
WH = "TESTNET_EXAMPLE_WH"
KEYS = {"admin": "farmledge-admin", "custodian": "fl-custodian",
        "verifier": "fl-verifier", "lender": "fl-tn-lender", "owner": "fl-example-owner"}
OUT = os.path.join(os.path.dirname(__file__), "testnet-example.bundle.json")
LOG = os.path.join(os.path.dirname(__file__), "testnet-example.log.json")


def sh(*args, check=True):
    res = subprocess.run(args, capture_output=True, text=True)
    if check and res.returncode != 0:
        sys.exit(f"{' '.join(args)}\n{res.stdout}{res.stderr}")
    return res


def addr(key):
    return sh("stellar", "keys", "address", key).stdout.strip()


def invoke(source, fn, check=True, **kw):
    args = ["stellar", "contract", "invoke", "--id", CONTRACT, "--source-account", KEYS[source],
            "--network", NETWORK, "--send", "yes", "--", fn]
    for k, v in kw.items():
        args += [f"--{k}", str(v)]
    res = sh(*args, check=check)
    print(f"{fn}: {res.stdout.strip() or res.stderr.strip().splitlines()[-1]}")
    return res


def main():
    if os.path.exists(OUT):
        sys.exit(f"{OUT} exists: the example is made once. Delete it only to replace the example.")
    if sh("stellar", "keys", "address", KEYS["owner"], check=False).returncode != 0:
        sh("stellar", "keys", "generate", KEYS["owner"], "--network", NETWORK)
        sh("stellar", "keys", "fund", KEYS["owner"], "--network", NETWORK)
    A = {k: addr(v) for k, v in KEYS.items()}

    # Register the example warehouse and its custodian. The verifier is shared.
    invoke("admin", "add_warehouse", check=False, warehouse_id=WH)
    invoke("admin", "add_custodian", check=False, warehouse_id=WH, custodian=KEYS["custodian"])
    invoke("admin", "add_verifier", check=False, verifier=KEYS["verifier"])

    # Yesterday's books: two lots, each a deposit leaf and an end-of-day
    # balance leaf, ordered by (kind, deposit_no) as docs/events.md says.
    day = int(time.time()) // 86_400 - 1
    lots = [(1, "TESTNET-EXAMPLE-LOT-0001", 4000, 40), (2, "TESTNET-EXAMPLE-LOT-0002", 1500, 15)]
    leaves = []
    for kind in (0, 2):
        for no, dep_id, kg, bags in lots:
            leaves.append({"version": 1, "kind": kind, "warehouse_id": WH, "day": day,
                           "index": len(leaves), "deposit_no": no, "deposit_id": dep_id,
                           "receipt_id": 0, "receipt_version": 0, "owner": A["owner"],
                           "commodity": "MAIZE_WHITE", "grade": "GRADE_1", "kg": kg,
                           "weight_source": "Scale", "bags": bags, "moisture_bps": 1250,
                           "custodian": A["custodian"], "verifier": A["verifier"],
                           "deposited_at": day * 86_400 + 36_000 + no * 600,
                           "at": day * 86_400 + 36_000 + no * 600 if kind == 0 else (day + 1) * 86_400,
                           "salt": os.urandom(32).hex()})
    level = [vp.leaf_hash(l) for l in leaves]
    levels = [level]
    while len(level) > 1:
        level = [vp.sha(b"\x01", level[i], level[i + 1]) for i in range(0, len(level), 2)]
        levels.append(level)
    root = levels[-1][0]

    def proof(i):
        out = []
        for lv in levels[:-1]:
            out.append(lv[i ^ 1].hex()); i //= 2
        return out

    log = {"warehouse_id": WH, "day": day, "leaves": len(leaves), "root": root.hex(), "steps": []}
    res = invoke("custodian", "anchor", custodian=KEYS["custodian"], warehouse_id=WH, day=day,
                 root=root.hex(), leaves=len(leaves))
    head = res.stdout.strip().strip('"')
    log["steps"].append({"anchor": head})

    # Mint lot 1 from its balance leaf, then pledge part and release part.
    balance = 2
    rid = int(invoke("custodian", "mint_from_anchor", custodian=KEYS["custodian"],
                     verifier=KEYS["verifier"], leaf=json.dumps(leaves[balance]),
                     proof=json.dumps(proof(balance))).stdout.strip().strip('"'))
    due = (int(time.time()) // 86_400 + 60) * 86_400
    locked = int(invoke("owner", "lock", receipt_id=rid, lender=KEYS["lender"], kg=1200,
                        loan_ref="TESTNET-EXAMPLE", due_date=due, grace_period=14 * 86_400)
                 .stdout.strip().strip('"'))
    exited = int(invoke("owner", "exit", receipt_id=rid, custodian=KEYS["custodian"], kg=400,
                        exit_weight_kg=398).stdout.strip().strip('"'))
    log["steps"] += [{"minted": rid}, {"locked": locked, "kg": 1200, "due_date": due},
                     {"exited": exited, "kg": 400}]

    deposit = 0  # the farmer's proof is of the deposit leaf of lot 1
    bundle = {"rpc": RPC, "contract_id": CONTRACT, "leaf": leaves[deposit], "proof": proof(deposit),
              "day_leaves": len(leaves), "prev_head": "00" * 32, "later_days": []}
    with open(OUT, "w") as f:
        json.dump(bundle, f, indent=2)
    with open(LOG, "w") as f:
        json.dump(log, f, indent=2)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
