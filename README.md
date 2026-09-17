# 120 Carlton; Food Value Map

Same question as the [NYFood](https://github.com/behdadmansouri/NYFood) study; $ per 1000 kcal, $ per 20g protein, measured against a grocery baseline; scoped to a 1km radius around 120 Carlton St, Toronto, and including the Loblaws two blocks away as the home-cooked comparison point.

Live page: https://behdadmansouri.github.io/carlton-food-value/

## What this is

14 restaurant venues + Loblaws Carlton Street, all within 1km of 120 Carlton St. Real prices (scraped from restaurant sites, delivery listings, or Google Maps, September 2026; never fabricated). Nutrition is a component-based estimate from each dish's description (not lab data), confidence-tagged per row.

## Data honesty

- Every price traces to a source noted in `data.js`.
- Confidence: `high` = published/chain nutrition or explicit menu weights; `medium` = component estimate from a detailed description; `low` = thin description or a weakly-sourced price.
- A few leads (permanently-closed venues, addresses outside the 1km radius, unconfirmed prices) were dropped rather than guessed; see the research notes in the commit history.
- Grocery shelf prices came from web-indexed Loblaws/No Name listings (loblaws.ca blocked direct scraping); flagged medium confidence in the source notes, worth a live re-check before treating as exact.

## Local dev

Static site, no build step. `python3 -m http.server` and open `index.html`.
