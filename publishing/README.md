# Remember When? - KDP paperback package

This directory contains the reproducible source and final print files for the
8.5 x 11 inch, no-bleed paperback interior. The full-wrap cover includes the
required 0.125 inch cover bleed and a spine calculated for **66 white-paper
pages** (`66 x 0.002252 = 0.148632 inches`).

## Final files

- `output/remember-when-1960s-interior.pdf` - 66-page, black-only interior
- `output/remember-when-1960s-cover.pdf` - 17.398632 x 11.25 inch full wrap
- `output/qa-report.json` - machine-readable preflight results and metadata

The literal author and publisher placeholders requested in the brief are
retained. Replace `AUTHOR` and `PUBLISHER` in `generate_kdp.py`, regenerate,
and re-run preflight before upload.

## Regenerate and preflight

```bash
python publishing/generate_kdp.py
python publishing/preflight.py
```

The generator is dependency-free and embeds a TrueType monospace regular/bold
font pair from the host. It uses a fixed seed, so puzzle and solution output is
deterministic.

## KDP upload settings

- Trim: 8.5 x 11 inches
- Interior: black and white, white paper, no bleed
- Cover finish: matte (selected in KDP; it is not a PDF property)
- Barcode: allow KDP to place it in the reserved lower-right back-cover box
