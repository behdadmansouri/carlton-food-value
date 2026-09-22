# Using the Carlton food-value page

## Just look at it
https://behdadmansouri.github.io/carlton-food-value/ — GitHub Pages serves `main`, so pushing is
publishing. No build step.

## Run it locally
Opening `index.html` straight off disk works, but Leaflet's tiles and `localStorage` behave better
over HTTP:

```bash
python3 -m http.server 8793 --directory "$PWD"
```

Then http://localhost:8793.

## Using the page
- **🚚 Channel** rewrites every price for how you actually buy it (menu, +tax, +tax and tip,
  delivery). Grocery hides restaurant dishes, since they have no grocery price.
- **⚙️ Pro mode** (header) turns on the full instrument: six weighted sliders that build a personal
  score, a venue ranking, a max-spend slider, cuisine and search filters, and a ▸ expander per row
  showing where that dish's price and nutrition came from. Your choice is remembered in the
  browser; toggling it back loses nothing.
- Sliders are relative to each other. Six at 3 rank identically to six at 9; a slider at 0 drops
  that dimension entirely.

## Editing the data
`data.js` is one object, `window.CARLTON_DATA`. Every dish needs `price`, `kcal`, `protein_g`,
`veg_g`, `format`, `confidence` and a `note` naming the source. Never fabricate a price; a missing
row is information. After editing:

```bash
node -e 'global.window={};eval(require("fs").readFileSync("data.js","utf8"));console.log(window.CARLTON_DATA.venues.length)'
```
