# TODO: Carlton Food Value 🥡

## 🔍 Verification
- [ ] 🧍 **What you should see** - the map, value frontier chart, and table at
      https://behdadmansouri.github.io/carlton-food-value/ populated with 88 venues; toggling a
      format checkbox fades points in/out without the chart rescaling or jumping.
- [ ] 🤖 **What should stay true** - `git log` in this folder matches `origin/main` (no unpushed
      or diverged commits); `node -e` eval of `data.js` parses clean with no NaN cost fields.

## 📋 Backlog
- [ ] **More venues** `M`: user asked for "maximum" once already (got to 88); could still be
      denser in the south/Moss Park zone specifically, which returned fewer real venues than the
      others. Re-read this project's CLAUDE.md "how this dataset was built" section before
      running parallel research agents again (browser-tool contention bit us once).
