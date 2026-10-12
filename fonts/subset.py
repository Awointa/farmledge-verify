"""Subsets the self-hosted fonts. Run from the repo root with fontTools 4.55.3 and brotli:

    python3 fonts/subset.py <dir with the google/fonts variable TTFs> fonts

Sources: github.com/google/fonts ofl/dmsans, ofl/fraunces, ofl/jetbrainsmono (SIL OFL 1.1).
None of the three families has the Hausa hooked letters (ɓ ɗ ƙ Ɓ Ɗ Ƙ ƴ Ƴ ʼ): a Hausa
page needs another family. The script asks for them, so a family that has them gets them.
"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

src, out = sys.argv[1], sys.argv[2]
HAUSA = [0x0181, 0x018A, 0x0198, 0x0199, 0x01B3, 0x01B4, 0x0253, 0x0257, 0x02BC]  # Ɓ Ɗ Ƙ ƙ Ƴ ƴ ɓ ɗ ʼ
WANT = list(range(0x20, 0x7F)) + [0xA0, 0xB7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2713, 0x2715] + HAUSA
TEXT = list(range(0x20, 0x7F)) + [0xA0, 0xB7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026] + HAUSA
# Fraunces sets only headings, all fixed page copy: letters, digits, the punctuation they use.
HEAD = [ord(c) for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;'\"?!-()&/"] + [0xA0, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026]
CODE = list(range(0x20, 0x7F))  # ids, hashes, addresses, commands: ASCII only, no ligatures
JOBS = [
    ("DMSans[opsz,wght].ttf", {"wght": 400, "opsz": 14}, "dm-sans-400.woff2", TEXT, ["kern"]),
    ("DMSans[opsz,wght].ttf", {"wght": 700, "opsz": 14}, "dm-sans-700.woff2", TEXT, ["kern"]),
    ("Fraunces[SOFT,WONK,opsz,wght].ttf", {"wght": 600, "opsz": 48, "SOFT": 0, "WONK": 0}, "fraunces-600.woff2", HEAD, ["kern"]),
    ("JetBrainsMono[wght].ttf", {"wght": 400}, "jetbrains-mono-400.woff2", CODE, []),
]
import json
coverage = {}
total = 0
for name, axes, dest, WANT, features in JOBS:
    f = TTFont(os.path.join(src, name.replace("[", "%5B").replace("]", "%5D")))
    have = set(f.getBestCmap())
    missing = [hex(c) for c in WANT if c not in have]
    f = instantiateVariableFont(f, axes)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = features
    opts.hinting = False
    opts.desubroutinize = True
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep copyright and licence
    s = subset.Subsetter(opts)
    s.populate(unicodes=[c for c in WANT if c in have])
    s.subset(f)
    path = os.path.join(out, dest)
    f.flavor = "woff2"
    f.save(path)
    size = os.path.getsize(path); total += size
    hausa_missing = [hex(c) for c in HAUSA if c not in have]
    coverage[dest] = sorted(c for c in WANT if c in have)
    print(f"{dest:28} {size:6} B   missing: {missing}   hausa missing: {hausa_missing}")
print(f"total {total} B")
json.dump({"note": "Code points each font file covers, written by the subsetting script. test/fonts.test.js checks the page uses no others.", "fonts": coverage}, open(os.path.join(out, "coverage.json"), "w"), indent=1)
