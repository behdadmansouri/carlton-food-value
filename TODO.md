# TODO: Carlton Food Value 🥡

## 🔍 Verification
- [ ] 🧍 **What you should see** - the map, value frontier chart, and table at
      https://behdadmansouri.github.io/carlton-food-value/ populated with 88 venues; toggling a
      format checkbox fades points in/out without the chart rescaling or jumping.
- [ ] 🧍 **⚙️ Pro mode works both ways** - flipping it on adds the sliders, venue ranking and
      budget slider; flipping it off returns the simple page with nothing stranded, and the
      choice survives a reload.
- [ ] 🤖 **What should stay true** - `git log` in this folder matches `origin/main` (no unpushed
      or diverged commits); `node -e` eval of `data.js` parses clean with no NaN cost fields.

## 📋 Backlog
- [ ] **Chart zoom/pan in pro mode** `M`: NYFood's frontier, spread and fanciness charts take
      ctrl+scroll zoom and drag-pan. Deliberately skipped here (Leaflet already zooms the map, and
      the fixed axis domain is what keeps this chart stable); revisit if the frontier gets crowded.
- [ ] **More venues** `M`: user asked for "maximum" once already (got to 88); could still be
      denser in the south/Moss Park zone specifically, which returned fewer real venues than the
      others. Re-read this project's CLAUDE.md "how this dataset was built" section before
      running parallel research agents again (browser-tool contention bit us once).
