#!/bin/sh
# The deployed site: the page and what it links to, nothing else. No tests,
# no fixtures, no example generator: only the real Testnet example bundle.
set -eu
out=${1:-_site}
rm -rf "$out"
mkdir -p "$out/scripts" "$out/example" "$out/fonts"
cp index.html style.css LICENSE "$out/"
cp -r src "$out/"
cp fonts/*.woff2 fonts/LICENSE-*.txt "$out/fonts/"
cp scripts/verify_proof.py scripts/verify_proof.pin.json "$out/scripts/"
cp example/testnet-example.bundle.json example/README.md "$out/example/"
touch "$out/.nojekyll"
find "$out" -type f | sort
