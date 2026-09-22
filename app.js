(function(){
  const D = window.CARLTON_DATA;
  const FORMATS = ["protein_on_starch","wrap_sandwich","soup_bowl","composed_small_plates","whole_item_family","grocery_home","grocery_ready"];
  const FORMAT_LABEL = {
    protein_on_starch:"Protein on starch", wrap_sandwich:"Wrap / sandwich", soup_bowl:"Soup bowl",
    composed_small_plates:"Composed small plates", whole_item_family:"Whole item / family",
    grocery_home:"Grocery — home-cooked", grocery_ready:"Grocery — ready-to-eat"
  };
  // ONE emoji per concept, reused in every place that concept appears (chips, legend,
  // table cells, tooltips, matrix headers, tells). A legend, not decoration.
  const FORMAT_EMOJI = {
    protein_on_starch:"🍖", wrap_sandwich:"🌯", soup_bowl:"🍜",
    composed_small_plates:"🍱", whole_item_family:"🍗",
    grocery_home:"🛒", grocery_ready:"🥡"
  };
  const CONF_EMOJI = {high:"✅", medium:"🟡", low:"⚠️"};
  const CHANNEL_EMOJI = {grocery:"🛒", dine_in:"🍽️", counter:"🥡", table:"🍷", delivery:"🛵"};
  // Per-cell emoji so a wall of numbers has something to anchor on, rather than
  // only the column header far above the fold.
  const CELL_EMOJI = {price:"💵", kcal:"🔥", protein_g:"🥩", veg_g:"🥦", distance_m:"📍",
    energy_cost:"🔥", protein_cost:"🥩", score:"🎚️"};
  const fmtLabel = f => FORMAT_EMOJI[f] + " " + FORMAT_LABEL[f];

  // ---- ingredient tags (3) ----
  // Keyword-derived from each dish's name plus its component note; this dataset has
  // no curated ingredient field. Deliberately conservative: a dish that matches
  // nothing stays UNTAGGED and is never excluded, because silently hiding rows on a
  // guess is worse than showing one the user then skips. Order matters only in that
  // a dish can carry several tags at once (a surf-and-turf hits beef and seafood).
  const INGREDIENTS = [
    {key:"seafood", emoji:"🐟", label:"seafood", words:["fish","salmon","tuna","shrimp","prawn","crab","lobster","squid","calamari","octopus","scallop","mussel","clam","oyster","anchovy","sardine","cod","tilapia","haddock","eel","unagi","sashimi","sushi","maki","nigiri","poke","ceviche","seafood","tempura roll"]},
    {key:"pork",    emoji:"🐖", label:"pork",    words:["pork","bacon","ham ","chashu","char siu","prosciutto","pepperoni","chorizo","carnitas","pancetta","salami","lardon","spare rib","pulled pork","sausage"]},
    {key:"chicken", emoji:"🐔", label:"chicken", words:["chicken","poulet","karaage","wing","nugget","tender","rotisserie","jerk chicken","chicken katsu","poultry"]},
    {key:"beef",    emoji:"🐄", label:"beef",    words:["beef","steak","burger","brisket","pastrami","corned beef","angus","patty","bulgogi","koobideh","kubideh","kofta","meatball","veal","short rib","pho "]},
    {key:"lamb",    emoji:"🐑", label:"lamb / goat", words:["lamb","goat","mutton","gyro","doner","shawarma"]},
    {key:"turkey",  emoji:"🦃", label:"turkey",  words:["turkey"]},
    {key:"egg",     emoji:"🥚", label:"egg",     words:["egg","omelette","omelet","tamago","frittata"]},
    {key:"dairy",   emoji:"🧀", label:"dairy",   words:["cheese","paneer","yogurt","yoghurt","butter","cream","milk","feta","mozzarella","halloumi"]},
    {key:"plant",   emoji:"🌱", label:"plant protein", words:["tofu","lentil","chickpea","bean","falafel","vegan","vegetarian","tempeh","seitan","edamame","mushroom","peanut butter"]}
  ];
  const CONF = ["high","medium","low"];
  const CHANNELS = [
    {key:"grocery", label:"Grocery baseline", mult:1.00, note:"Ingredients or ready-to-eat, no restaurant markup. Restaurant dishes are hidden on this ring — they don't have a grocery price."},
    {key:"dine_in", label:"Dine-in / takeout menu", mult:1.00, note:"Menu price as scraped. No tax or tip applied."},
    {key:"counter", label:"Counter takeout", mult:1.13, note:"+13% HST, no tip."},
    {key:"table", label:"Table service", mult:1.30, note:"+13% HST + ~15–18% tip."},
    {key:"delivery", label:"Delivery app", mult:1.75, note:"+markup, service fee, delivery fee, tip — 1.6–1.9× is the typical range; 1.75× shown."}
  ];
  const RESTAURANT_FORMATS = new Set(["protein_on_starch","wrap_sandwich","soup_bowl","composed_small_plates","whole_item_family"]);

  // ---- flatten dishes ----
  let rows = [];
  D.venues.forEach(v=>{
    v.dishes.forEach(d=>{
      rows.push(Object.assign({venue:v.name, cuisine:v.cuisine, address:v.address,
        lat:v.lat, lng:v.lng, distance_m:v.distance_m}, d));
    });
  });
  D.grocery_meals.forEach(d=>{
    rows.push(Object.assign({venue:D.grocery_store.name, cuisine:"Grocery", address:D.grocery_store.address,
      lat:D.grocery_store.lat, lng:D.grocery_store.lng, distance_m:D.grocery_store.distance_m}, d));
  });
  (D.grocery_ready_meals||[]).forEach(d=>{
    rows.push(Object.assign({venue:D.grocery_store.name, cuisine:"Grocery", address:D.grocery_store.address,
      lat:D.grocery_store.lat, lng:D.grocery_store.lng, distance_m:D.grocery_store.distance_m}, d));
  });
  rows.forEach(r=>{ r.price_menu = r.price; });

  // tag each row from the keyword table above, now that the rows exist
  rows.forEach(r=>{
    const hay = ((r.dish_name||'') + ' ' + (r.note||'')).toLowerCase();
    r.ingredients = INGREDIENTS.filter(g=>g.words.some(w=>hay.includes(w))).map(g=>g.key);
  });

  // ---- what this dish costs as a multiple of cooking it yourself ----
  // Baseline is the median of the 14 Loblaws home-cooked combos on BOTH axes. To
  // match a dish at home you have to cover its calories AND its protein, so the
  // home-equivalent price is whichever of the two costs more; taking the cheaper
  // one would flatter every restaurant dish. Grocery rows therefore land at ~1x,
  // which is the sanity check that this is calibrated and not just a ratio.
  const HOME_ROWS = rows.filter(r=>r.format==='grocery_home');
  const HOME_ENERGY = median(HOME_ROWS.map(r=>r.energy_cost));
  const HOME_PROTEIN = median(HOME_ROWS.map(r=>r.protein_cost));
  function homeEquivPrice(r){
    return Math.max(HOME_ENERGY*(r.kcal/1000), HOME_PROTEIN*(r.protein_g/20));
  }
  // A home-cooked row has no "vs cooking at home" multiple: it IS cooking at home.
  // Scoring one against the median home meal answered a different question ("is this
  // cheaper than a typical home meal?") while wearing this column's label, which is
  // how red lentils ended up reading 0.3x as though you could beat cooking by cooking.
  // Ready-to-eat grocery keeps its multiple; that is a real comparison.
  const HAS_MARKUP = r => r.format !== 'grocery_home';

  // ---- state ----
  const state = { maxDist: 1000, confs: new Set(CONF), formats: new Set(FORMATS), sortKey:"protein_cost", sortDir:1, channel:"dine_in",
    // ---- pro-mode state; inert while pro is off, because every pro control
    // starts at its most permissive value and nothing else reads them ----
    pro: false, maxSpend: 60, cuisines: null, query: "", shared: "all", excluded: new Set(),
    weights: {} };

  const SPEND_MAX = 60;   // the max-spend slider's ceiling; at it, the filter is off

  function channelMult(){ return CHANNELS.find(c=>c.key===state.channel).mult; }
  function effective(r){
    const applies = RESTAURANT_FORMATS.has(r.format);
    const price = applies ? r.price_menu * channelMult() : r.price_menu;
    const energy_cost = price / (r.kcal/1000);
    const protein_cost = price / (r.protein_g/20);
    const markup = HAS_MARKUP(r) ? price / homeEquivPrice(r) : null;
    return {price, energy_cost, protein_cost, markup};
  }

  // ================= MAP =================
  const map = L.map('map', {scrollWheelZoom:false}).setView([D.center.lat, D.center.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const radiusCircle = L.circle([D.center.lat, D.center.lng], {radius:1000, color:'#e0964a', weight:1.5, dashArray:'4 4', fill:true, fillOpacity:.04}).addTo(map);
  L.marker([D.center.lat, D.center.lng], {icon: L.divIcon({className:'', html:'<div style="width:14px;height:14px;border-radius:50%;background:#e8ecee;border:2px solid #0f1214"></div>', iconSize:[14,14]})})
    .addTo(map).bindPopup('<b>📍 120 Carlton St</b><br>Center point');

  function colorFor(fmt){ return getComputedStyle(document.documentElement).getPropertyValue('--c-'+fmt).trim(); }

  const venueMarkers = [];
  function addVenueMarkers(){
    D.venues.forEach(v=>{
      const best = v.dishes.reduce((a,b)=> (a.protein_cost < b.protein_cost ? a : b));
      const m = L.circleMarker([v.lat, v.lng], {
        radius:7, color:colorFor(best.format), weight:2, fillColor:colorFor(best.format), fillOpacity:.55
      }).addTo(map);
      const dishList = v.dishes.map(d=>`${FORMAT_EMOJI[d.format]} ${d.dish_name} — 💵 $${d.price.toFixed(2)} <span class="tag">${CONF_EMOJI[d.confidence]} ${d.confidence}</span>`).join('<br>');
      m.bindPopup(`<b>🏪 ${v.name}</b><br><span style="color:#98a3a8">${v.cuisine} · 📍 ${v.distance_m}m</span><br><br>${dishList}`);
      m._distance = v.distance_m;
      venueMarkers.push(m);
    });
    const g = L.circleMarker([D.grocery_store.lat, D.grocery_store.lng], {
      radius:8, color:colorFor('grocery_ready'), weight:2, fillColor:colorFor('grocery_ready'), fillOpacity:.7
    }).addTo(map).bindPopup(`<b>🛒 ${D.grocery_store.name}</b><br>Grocery baseline (home-cooked + ready-to-eat) · 📍 ${D.grocery_store.distance_m}m`);
    g._distance = D.grocery_store.distance_m;
    venueMarkers.push(g);
  }
  addVenueMarkers();

  function updateMapForDistance(){
    radiusCircle.setRadius(state.maxDist);
    venueMarkers.forEach(m=>{
      const inRange = m._distance <= state.maxDist;
      const el = m.getElement && m.getElement();
      if(el) el.style.opacity = inRange ? 1 : 0.12;
    });
  }

  // ================= CHART =================
  const svg = document.getElementById('chart');
  const tooltip = document.getElementById('tooltip');
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); return e; }

  // Fixed axis domain, computed once from the worst case across every row and
  // every channel (delivery is the most expensive multiplier). This keeps the
  // grid, ticks, and viewBox completely stable — filter toggles never rescale
  // or rebuild the chart, they only change which existing dots are visible.
  // Only a channel switch moves dots (deliberately, per the BRIEF: that's the
  // one place worth spending motion budget), and it slides within this same
  // fixed frame rather than rescaling under the points.
  const MAX_MULT = Math.max(...CHANNELS.map(c=>c.mult));
  function worstCase(r){
    const price = RESTAURANT_FORMATS.has(r.format) ? r.price_menu * MAX_MULT : r.price_menu;
    return { energy_cost: price/(r.kcal/1000), protein_cost: price/(r.protein_g/20) };
  }
  const axisMax = {
    x: Math.max(...rows.map(r=>worstCase(r).energy_cost)) * 1.08,
    y: Math.max(...rows.map(r=>worstCase(r).protein_cost)) * 1.12
  };

  function filteredRows(){
    return rows.filter(r => {
      if(r.distance_m > state.maxDist) return false;
      if(!state.confs.has(r.confidence)) return false;
      if(!state.formats.has(r.format)) return false;
      if(state.channel==='grocery' && RESTAURANT_FORMATS.has(r.format)) return false;
      if(state.pro){
        if(state.cuisines && !state.cuisines.has(r.cuisine)) return false;
        if(state.shared==='solo' && r.multi_meal) return false;
        if(state.excluded.size && r.ingredients.some(t=>state.excluded.has(t))) return false;
        if(state.maxSpend < SPEND_MAX && effective(r).price > state.maxSpend) return false;
        if(state.query){
          const q = state.query.toLowerCase();
          if(!(r.dish_name+' '+r.venue+' '+r.cuisine).toLowerCase().includes(q)) return false;
        }
      }
      return true;
    });
  }

  // The visible slice of the fixed domain. Zoom narrows this window rather than
  // scaling the SVG: ticks stay crisp, the labels report real dollar values at
  // whatever depth you're at, and dot radii keep their meaning (kcal), which a
  // viewBox transform would have quietly multiplied.
  // The full worst-case domain runs to ~$279, which parks nearly every dish in the
  // bottom-left corner and wastes the top and right of the panel. $70/$70 is where
  // the data actually lives, so that's the default frame; the handful of dishes
  // beyond it are still reachable by zooming out (the zoom limit is still the full
  // domain), and the chart says how many are currently off-frame rather than
  // pretending they don't exist.
  const HOME_FRAME = {x: Math.min(70, axisMax.x), y: Math.min(70, axisMax.y)};
  const view = {x0:0, x1:HOME_FRAME.x, y0:0, y1:HOME_FRAME.y};
  function viewReset(){ view.x0=0; view.x1=HOME_FRAME.x; view.y0=0; view.y1=HOME_FRAME.y; }

  function chartGeom(){
    const W = svg.clientWidth || 600, H = 420;
    const pad = {l:52,r:18,t:16,b:38};
    const sx = (W-pad.l-pad.r)/(view.x1-view.x0), sy = (H-pad.t-pad.b)/(view.y1-view.y0);
    return {W,H,pad,
      x: v => pad.l + (v-view.x0)*sx,
      y: v => H-pad.b - (v-view.y0)*sy,
      xInv: px => view.x0 + (px-pad.l)/sx,
      yInv: py => view.y0 + (H-pad.b-py)/sy
    };
  }
  function niceTick(v, span){
    return span >= 20 ? '$'+v.toFixed(0) : span >= 4 ? '$'+v.toFixed(1) : '$'+v.toFixed(2);
  }

  function drawAxes(){
    const {W,H,pad,x,y} = chartGeom();
    const g = svg._axes;
    g.textContent = '';
    const xTicks=5,yTicks=5, xSpan=view.x1-view.x0, ySpan=view.y1-view.y0;
    for(let i=0;i<=xTicks;i++){
      const v = view.x0 + xSpan*i/xTicks, gx = x(v);
      g.appendChild(el('line',{x1:gx,x2:gx,y1:pad.t,y2:H-pad.b,class:'grid-line'}));
      const t = el('text',{x:gx,y:H-pad.b+16,class:'axis-label','text-anchor':'middle'}); t.textContent=niceTick(v,xSpan); g.appendChild(t);
    }
    for(let i=0;i<=yTicks;i++){
      const v = view.y0 + ySpan*i/yTicks, gy = y(v);
      g.appendChild(el('line',{x1:pad.l,x2:W-pad.r,y1:gy,y2:gy,class:'grid-line'}));
      const t = el('text',{x:pad.l-8,y:gy+3,class:'axis-label','text-anchor':'end'}); t.textContent=niceTick(v,ySpan); g.appendChild(t);
    }
    const xl = el('text',{x:(W+pad.l-pad.r)/2,y:H-4,class:'axis-label','text-anchor':'middle'}); xl.textContent='🔥 $ per 1000 kcal'; g.appendChild(xl);
    const yl = el('text',{x:12,y:(H)/2,class:'axis-label','text-anchor':'middle',transform:`rotate(-90 12 ${H/2})`}); yl.textContent='🥩 $ per 20g protein'; g.appendChild(yl);
    const zl = document.getElementById('chart-zoomlbl');
    if(zl) zl.textContent = Math.abs(xSpan-HOME_FRAME.x) < 0.01 ? '' : (HOME_FRAME.x/xSpan).toFixed(1)+'× zoom';
  }

  function buildChartOnce(){
    svg.innerHTML='';
    const {W,H,pad} = chartGeom();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // marks live inside a clipped group so a zoomed-in view never paints dots
    // over the axis gutters
    const defs = el('defs',{});
    const cp = el('clipPath',{id:'plot-clip'});
    cp.appendChild(el('rect',{x:pad.l,y:pad.t,width:Math.max(0,W-pad.l-pad.r),height:Math.max(0,H-pad.t-pad.b)}));
    defs.appendChild(cp); svg.appendChild(defs);

    svg._axes = el('g',{}); svg.appendChild(svg._axes);
    svg._marks = el('g',{'clip-path':'url(#plot-clip)'}); svg.appendChild(svg._marks);

    const frontierPath = el('path',{class:'frontier-line', d:''});
    svg._marks.appendChild(frontierPath);
    svg._frontierPath = frontierPath;

    svg._dots = {};
    rows.forEach((r)=>{
      const key = r.venue+'|'+r.dish_name;
      const c = el('circle',{cx:-100,cy:-100,r:5, fill:colorFor(r.format), class:'dot'+(r.confidence==='low'?' low-conf':'')});
      c._row = r;
      svg._marks.appendChild(c);
      svg._dots[key] = c;
    });
    drawAxes();
  }
  buildChartOnce();

  // ---- zoom + pan, shared by both SVG charts ----
  // Plain wheel scrolls the page; ctrl/cmd+wheel zooms, matching the NYFood
  // dashboard and every map UI. Drag pans. Zooming holds the point under the
  // cursor still, so you can drill into a cluster without chasing it.
  function attachZoom(node, win, limits, redraw, geom){
    let drag = null;
    node.addEventListener('wheel', ev=>{
      if(!(ev.ctrlKey || ev.metaKey)) return;     // let the page scroll otherwise
      ev.preventDefault();
      const g = geom(), rect = node.getBoundingClientRect();
      if(!rect.width || !rect.height) return;
      const px = (ev.clientX-rect.left) * (g.W/rect.width);
      const py = (ev.clientY-rect.top) * (g.H/rect.height);
      zoomAt(win, limits, g.xInv(px), g.yInv(py), ev.deltaY > 0 ? 1.18 : 1/1.18);
      redraw();
    }, {passive:false});
    node.addEventListener('pointerdown', ev=>{
      if(ev.button!==0) return;
      const rect = node.getBoundingClientRect();
      // a hidden or not-yet-laid-out pane reports zero width; dividing by it would
      // turn the whole axis window into NaN on the first pointermove
      if(!rect.width || !rect.height) return;
      drag = {x:ev.clientX, y:ev.clientY, sx:(win.x1-win.x0)/rect.width, sy:(win.y1-win.y0)/rect.height};
      node.setPointerCapture(ev.pointerId);
      node.style.cursor = 'grabbing';
    });
    node.addEventListener('pointermove', ev=>{
      if(!drag) return;
      const dx = (ev.clientX-drag.x)*drag.sx, dy = (ev.clientY-drag.y)*drag.sy;
      panBy(win, limits, -dx, dy);
      drag.x = ev.clientX; drag.y = ev.clientY;
      redraw();
    });
    const end = ev=>{ if(drag){ drag=null; node.style.cursor=''; try{node.releasePointerCapture(ev.pointerId);}catch(e){} } };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }
  // Never let you zoom out past the full domain or in past a sliver, and never
  // let a pan walk the window off the data entirely.
  function clampWin(win, lim){
    const wx = Math.min(win.x1-win.x0, lim.x), wy = Math.min(win.y1-win.y0, lim.y);
    if(win.x0 < 0){ win.x0 = 0; } if(win.x0 + wx > lim.x){ win.x0 = lim.x - wx; }
    if(win.y0 < 0){ win.y0 = 0; } if(win.y0 + wy > lim.y){ win.y0 = lim.y - wy; }
    win.x1 = win.x0 + wx; win.y1 = win.y0 + wy;
  }
  function zoomAt(win, lim, cx, cy, factor){
    const wx = Math.min(lim.x, Math.max(lim.x/60, (win.x1-win.x0)*factor));
    const wy = Math.min(lim.y, Math.max(lim.y/60, (win.y1-win.y0)*factor));
    const fx = (cx-win.x0)/(win.x1-win.x0), fy = (cy-win.y0)/(win.y1-win.y0);
    win.x0 = cx - fx*wx; win.x1 = win.x0 + wx;
    win.y0 = cy - fy*wy; win.y1 = win.y0 + wy;
    clampWin(win, lim);
  }
  function panBy(win, lim, dx, dy){
    win.x0 += dx; win.x1 += dx; win.y0 += dy; win.y1 += dy;
    clampWin(win, lim);
  }

  const CHART_LIM = {x:axisMax.x, y:axisMax.y};
  function redrawChart(){ drawAxes(); renderChart(); renderPickBadges(); }
  attachZoom(svg, view, CHART_LIM, redrawChart, chartGeom);
  ['zin','zout','zreset'].forEach(k=>{
    const b = document.getElementById('chart-'+k);
    if(!b) return;
    b.addEventListener('click', ()=>{
      if(k==='zreset') viewReset();
      else zoomAt(view, CHART_LIM, (view.x0+view.x1)/2, (view.y0+view.y1)/2, k==='zin' ? 1/1.5 : 1.5);
      redrawChart();
    });
  });

  function renderChart(){
    const visible = filteredRows();
    const visibleKeys = new Set(visible.map(r=>r.venue+'|'+r.dish_name));
    const {x,y} = chartGeom();

    const eff = visible.map(r=>Object.assign({r}, effective(r)));
    const sorted = eff.slice().sort((a,b)=>a.energy_cost-b.energy_cost);
    const frontier = [];
    let minY = Infinity;
    sorted.forEach(p=>{ if(p.protein_cost < minY){ frontier.push(p); minY = p.protein_cost; } });
    const frontierRowKeys = new Set(frontier.map(p=>p.r.venue+'|'+p.r.dish_name));
    if(frontier.length>1){
      const path = frontier.map((p,i)=> (i===0?'M':'L') + x(p.energy_cost).toFixed(1) + ',' + y(p.protein_cost).toFixed(1)).join(' ');
      svg._frontierPath.setAttribute('d', path);
    } else {
      svg._frontierPath.setAttribute('d', '');
    }

    let offFrame = 0;
    rows.forEach(r=>{
      const key = r.venue+'|'+r.dish_name;
      const c = svg._dots[key];
      if(!c) return;
      const isVisible = visibleKeys.has(key);
      if(isVisible){
        const ec = effective(r);
        if(ec.energy_cost > view.x1 || ec.protein_cost > view.y1 ||
           ec.energy_cost < view.x0 || ec.protein_cost < view.y0) offFrame++;
      }
      const ef = effective(r);
      const onFrontier = frontierRowKeys.has(key);
      const radius = 4 + Math.min(6, Math.sqrt(r.kcal)/14);
      c.setAttribute('cx', x(ef.energy_cost).toFixed(1));
      c.setAttribute('cy', y(ef.protein_cost).toFixed(1));
      c.setAttribute('r', radius.toFixed(1));
      c.setAttribute('fill-opacity', isVisible ? (onFrontier ? 0.95 : (r.format.startsWith('grocery') ? 0.9 : 0.55)) : 0);
      c.style.pointerEvents = isVisible ? 'auto' : 'none';
      c._data = {r, energy_cost: ef.energy_cost, protein_cost: ef.protein_cost, price: ef.price, markup: ef.markup};
    });
    const off = document.getElementById('chart-offframe');
    if(off) off.textContent = offFrame
      ? `${offFrame} matching ${offFrame===1?'dish is':'dishes are'} off this frame — zoom out to reach ${offFrame===1?'it':'them'}`
      : '';
  }

  function showTooltip(ev, r, eff){
    tooltip.style.opacity = 1;
    const rect = svg.getBoundingClientRect();
    tooltip.style.left = (ev.clientX - rect.left + 14) + 'px';
    tooltip.style.top = (ev.clientY - rect.top + 10) + 'px';
    tooltip.innerHTML = `<b>${r.dish_name}</b>
      <div class="tt-meta">${r.venue} · ${r.cuisine} · 📍 ${r.distance_m}m</div>
      <div class="tt-metrics">
        <div><span>💵 Price now</span>$${eff.price.toFixed(2)}</div>
        <div><span>🔥 kcal</span>${r.kcal}</div>
        <div><span>🥩 Protein</span>${r.protein_g}g</div>
      </div>
      <div class="tt-metrics">
        <div><span>🔥 $/1000kcal</span>$${eff.energy_cost.toFixed(2)}</div>
        <div><span>🥩 $/protein unit</span>$${eff.protein_cost.toFixed(2)}</div>
        <div><span>🏠 vs home-cooked</span>${eff.markup==null ? 'is home' : eff.markup.toFixed(1)+'×'}</div>
      </div>
      <div class="tt-meta" style="margin-top:6px">${fmtLabel(r.format)} · ${CONF_EMOJI[r.confidence]} ${r.confidence}${r.multi_meal?' · 👥 multi-meal':''}</div>`;
  }
  function hideTooltip(){ tooltip.style.opacity = 0; }
  svg.addEventListener('mousemove', (ev)=>{
    const t = ev.target;
    if(t && t.tagName==='circle' && t._data){
      const {r, energy_cost, protein_cost, price, markup} = t._data;
      showTooltip(ev, r, {price, energy_cost, protein_cost, markup});
    } else {
      hideTooltip();
    }
  });
  svg.addEventListener('mouseleave', hideTooltip);

  // ================= CHANNEL TOGGLE =================
  const channelRow = document.getElementById('channel-row');
  const channelNote = document.getElementById('channel-note');
  CHANNELS.forEach(c=>{
    const btn = document.createElement('button');
    btn.className = 'channel-btn' + (c.key===state.channel ? ' active':'');
    btn.textContent = CHANNEL_EMOJI[c.key] + ' ' + c.label;
    btn.addEventListener('click', ()=>{
      state.channel = c.key;
      [...channelRow.children].forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      channelNote.textContent = c.note;
      renderAll();
    });
    channelRow.appendChild(btn);
  });
  channelNote.textContent = CHANNELS.find(c=>c.key===state.channel).note;

  // ================= FILTERS =================
  const distSlider = document.getElementById('dist-slider');
  const distVal = document.getElementById('dist-val');
  distSlider.addEventListener('input', ()=>{
    state.maxDist = +distSlider.value;
    distVal.textContent = state.maxDist + 'm';
    updateMapForDistance();
    renderAll();
  });
  updateMapForDistance();

  const confChips = document.getElementById('conf-chips');
  CONF.forEach(c=>{
    const chip = document.createElement('button');
    chip.className = 'chip active'; chip.textContent = CONF_EMOJI[c] + ' ' + c;
    chip.addEventListener('click', ()=>{
      if(state.confs.has(c)){ if(state.confs.size>1){ state.confs.delete(c); chip.classList.remove('active'); } }
      else { state.confs.add(c); chip.classList.add('active'); }
      renderAll();
    });
    confChips.appendChild(chip);
  });

  const fmtChips = document.getElementById('fmt-chips');
  FORMATS.forEach(f=>{
    const chip = document.createElement('button');
    chip.className = 'chip active';
    chip.innerHTML = `<span class="swatch" style="background:${'var(--c-'+f+')'}"></span>${fmtLabel(f)}`;
    chip.addEventListener('click', ()=>{
      if(state.formats.has(f)){ if(state.formats.size>1){ state.formats.delete(f); chip.classList.remove('active'); } }
      else { state.formats.add(f); chip.classList.add('active'); }
      renderAll();
    });
    fmtChips.appendChild(chip);
  });

  // ================= TABLE =================
  const tbody = document.querySelector('#tbl tbody');
  const headers = document.querySelectorAll('#tbl thead th');
  headers.forEach(h=>{
    h.addEventListener('click', ()=>{
      const key = h.dataset.key;
      if(!key) return;                       // the pro expander column isn't sortable
      if(state.sortKey===key) state.sortDir *= -1; else { state.sortKey=key; state.sortDir=1; }
      renderTable();
    });
  });

  function renderTable(){
    let visible = filteredRows().map(r=>Object.assign({}, r, effective(r)));
    if(state.pro) applyScores(visible);
    visible.sort((a,b)=>{
      const k = state.sortKey;
      // "your score" is the one column where bigger is better, so its default
      // direction is flipped; every other column sorts ascending first.
      const dir = (k==='score') ? -state.sortDir : state.sortDir;
      // rows with no value for this column (a home-cooked row's markup) sort last
      // in both directions rather than masquerading as the cheapest
      const A = a[k] == null ? (dir>0 ? Infinity : -Infinity) : a[k];
      const B = b[k] == null ? (dir>0 ? Infinity : -Infinity) : b[k];
      return (A > B ? 1 : A < B ? -1 : 0) * dir;
    });
    const tn = document.getElementById('tbl-n');
    if(tn) tn.textContent = state.pro ? `${visible.length} of ${rows.length} dishes · click a column to sort · click ▸ for the source note`
                                      : 'click a column to sort';
    tbody.innerHTML = visible.map((r,i)=>`
      <tr data-idx="${i}">
        <td class="pro-only"><button class="expander" type="button" aria-expanded="false" aria-label="Show source note">&#9656;</button></td>
        <td class="dish-cell"><b>${r.dish_name}</b><span class="venue">${r.venue} · ${r.cuisine}</span></td>
        <td><span class="tag">${fmtLabel(r.format)}</span></td>
        <td class="num">📍 ${r.distance_m}m</td>
        <td class="num">💵 $${r.price.toFixed(2)}</td>
        <td class="num">🔥 ${r.kcal}</td>
        <td class="num">🥩 ${r.protein_g}g</td>
        <td class="num pro-only">${r.veg_g ? '🥦 '+r.veg_g+'g' : '—'}</td>
        <td class="num">🔥 $${r.energy_cost.toFixed(2)}</td>
        <td class="num">🥩 $${r.protein_cost.toFixed(2)}</td>
        <td class="num pro-only">${r.markup==null ? '<span class="empty" title="This row is the home-cooked baseline, so it has no multiple of itself">— baseline</span>' : '🏠 '+r.markup.toFixed(1)+'×'}</td>
        <td class="score-cell pro-only"><span class="scorebar" style="width:${(r.score||0)*0.34}px"></span>${(r.score||0).toFixed(0)}</td>
        <td class="conf-${r.confidence}">${CONF_EMOJI[r.confidence]} ${r.confidence}${r.multi_meal?' · 👥 multi-meal':''}</td>
      </tr>`).join('');
    tbody._rows = visible;
  }

  // Expander rows carry the provenance note; NYFood's table does the same thing,
  // and it is the single most useful column in a dataset where every price has
  // to trace to a named source.
  tbody.addEventListener('click', ev=>{
    const btn = ev.target.closest('.expander');
    if(!btn) return;
    const tr = btn.closest('tr');
    const open = btn.getAttribute('aria-expanded')==='true';
    const next = tr.nextElementSibling;
    if(open){
      if(next && next.classList.contains('detail-row')) next.remove();
      btn.setAttribute('aria-expanded','false'); btn.innerHTML='&#9656;';
      return;
    }
    const r = (tbody._rows||[])[+tr.dataset.idx];
    if(!r) return;
    const det = document.createElement('tr');
    det.className = 'detail-row';
    const tags = r.ingredients.map(k=>{ const g=INGREDIENTS.find(x=>x.key===k); return g.emoji+' '+g.label; }).join(' · ') || 'no ingredient keywords matched';
    det.innerHTML = `<td colspan="13">
      <div class="dlabel">🔎 source note · ${r.venue}${r.address?' · '+r.address:''}</div>${r.note||'No note recorded for this row.'}
      <div class="dlabel" style="margin-top:9px">🏠 vs cooking it yourself</div>
      ${r.markup==null
        ? `This <em>is</em> cooking it yourself, so there's no multiple to show. The baseline the other
           rows are measured against is the median of the ${HOME_ROWS.length} home-cooked combos
           ($${HOME_ENERGY.toFixed(2)} per 1000 kcal, $${HOME_PROTEIN.toFixed(2)} per 20g protein);
           this particular meal costs $${r.price.toFixed(2)} against a $${homeEquivPrice(r).toFixed(2)}
           typical one, which makes it a cheap home meal, not a way to beat cooking.`
        : `Making the same ${r.kcal} kcal and ${r.protein_g}g of protein from Loblaws staples runs about
           $${homeEquivPrice(r).toFixed(2)}; this is <b>${r.markup.toFixed(1)}×</b> that.`}
      <div class="dlabel" style="margin-top:9px">🏷️ ingredient keywords</div>${tags}</td>`;
    tr.after(det);
    btn.setAttribute('aria-expanded','true'); btn.innerHTML='&#9662;';
  });

  // ================= TIER VIEW =================
  const TIERS = [10, 15, 25];
  function renderTiers(){
    const wrap = document.getElementById('tier-grid');
    const visible = filteredRows().map(r=>Object.assign({}, r, effective(r)));
    wrap.innerHTML = TIERS.map(tier=>{
      const candidates = visible.filter(r=> r.price <= tier);
      if(candidates.length===0){
        return `<div class="tier-col"><h3>💵 At or under <b>$${tier}</b></h3><div class="tier-row empty">Nothing found at this price in the current filters.</div></div>`;
      }
      const byFormat = {};
      candidates.forEach(r=>{
        if(!byFormat[r.format] || r.protein_cost < byFormat[r.format].protein_cost) byFormat[r.format] = r;
      });
      const rowsHtml = Object.values(byFormat).sort((a,b)=>a.protein_cost-b.protein_cost).map(r=>`
        <div class="tier-row">
          <div class="t-fmt">${fmtLabel(r.format)}</div>
          <div class="t-dish">${r.dish_name}</div>
          <div class="t-meta">${r.venue} · 💵 $${r.price.toFixed(2)} · 🥩 ${r.protein_g}g · $${r.protein_cost.toFixed(2)}/unit</div>
        </div>`).join('');
      return `<div class="tier-col"><h3>💵 Best per format, at or under <b>$${tier}</b></h3>${rowsHtml}</div>`;
    }).join('');
  }

  // ================= SPREAD BY FORMAT =================
  function renderSpread(){
    const wrap = document.getElementById('spread-wrap');
    const visible = filteredRows().map(r=>Object.assign({}, r, effective(r)));
    if(visible.length===0){ wrap.innerHTML = '<div class="tier-row empty">Nothing to show in current filters.</div>'; return; }
    const maxPC = Math.max(...visible.map(r=>r.protein_cost)) * 1.05;
    const groups = {};
    visible.forEach(r=>{ (groups[r.format] = groups[r.format]||[]).push(r); });
    wrap.innerHTML = Object.keys(groups).map(fmt=>{
      const items = groups[fmt].sort((a,b)=>a.protein_cost-b.protein_cost);
      const vals = items.map(r=>r.protein_cost);
      const median = vals[Math.floor(vals.length/2)];
      const dotsHtml = items.map(r=>{
        const left = (r.protein_cost/maxPC*100).toFixed(1);
        return `<div class="spread-dot" title="${r.dish_name} — $${r.protein_cost.toFixed(2)}/unit ${r.markup==null?'':' · '+r.markup.toFixed(1)+'× home'} (${r.venue})" style="left:${left}%;background:${'var(--c-'+fmt+')'}"></div>`;
      }).join('');
      const medLeft = (median/maxPC*100).toFixed(1);
      return `<div class="spread-row">
        <div class="spread-label">${fmtLabel(fmt)}<div class="n">n=${items.length}, median $${median.toFixed(2)}</div></div>
        <div class="spread-track"><div class="base-line"></div><div class="spread-median" style="left:${medLeft}%"></div>${dotsHtml}</div>
      </div>`;
    }).join('');
  }

  // ================= FORMAT x CUISINE MATRIX =================
  function median(arr){ const s=arr.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
  function renderMatrix(){
    const wrap = document.getElementById('matrix-wrap');
    const visible = filteredRows().map(r=>Object.assign({}, r, effective(r))).filter(r=>RESTAURANT_FORMATS.has(r.format));
    if(visible.length===0){ wrap.innerHTML = '<div class="tier-row empty">Nothing to show in current filters.</div>'; return; }
    const cuisines = [...new Set(visible.map(r=>r.cuisine))].sort();
    const formats = FORMATS.filter(f=>RESTAURANT_FORMATS.has(f));
    const cellVals = {};
    formats.forEach(f=>cuisines.forEach(c=>{
      const vals = visible.filter(r=>r.format===f && r.cuisine===c).map(r=>r.protein_cost);
      if(vals.length) cellVals[f+'|'+c] = median(vals);
    }));
    const allVals = Object.values(cellVals);
    const lo = Math.min(...allVals), hi = Math.max(...allVals);
    function shade(v){
      if(v===undefined) return 'transparent';
      const t = hi>lo ? (v-lo)/(hi-lo) : 0;
      const r = Math.round(224 - t*140), g = Math.round(100 + (1-t)*40), b = 79;
      return `rgba(${224-Math.round(t*150)}, ${89+Math.round((1-t)*40)}, 79, ${0.15+t*0.55})`;
    }
    let html = '<div class="table-scroll"><table class="matrix-table"><thead><tr><th></th>' +
      formats.map(f=>`<th>${fmtLabel(f)}</th>`).join('') + '</tr></thead><tbody>';
    cuisines.forEach(c=>{
      html += `<tr><th class="row-h">${c}</th>` + formats.map(f=>{
        const v = cellVals[f+'|'+c];
        return `<td style="background:${shade(v)}">${v!==undefined ? '$'+v.toFixed(2) : '—'}</td>`;
      }).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  // ================= FANCINESS VS VALUE =================
  const fsvg = document.getElementById('fancy-chart');
  function venueAvgPrice(venueName){
    const v = D.venues.find(v=>v.name===venueName);
    if(!v) return null;
    return v.dishes.reduce((s,d)=>s+d.price,0)/v.dishes.length;
  }
  // Fixed domain, same reasoning as the frontier chart: filters must not rescale
  // the axes under you. Worst case is the delivery multiplier across every dish.
  const FANCY_MAX = (()=>{
    const all = rows.filter(r=>RESTAURANT_FORMATS.has(r.format));
    return {
      x: Math.max(...D.venues.map(v=>v.dishes.reduce((s,d)=>s+d.price,0)/v.dishes.length))*1.1,
      y: Math.max(...all.map(r=>worstCase(r).protein_cost))*1.12
    };
  })();
  const fview = {x0:0, x1:FANCY_MAX.x, y0:0, y1:FANCY_MAX.y};
  function fancyGeom(){
    const W = fsvg.clientWidth || 600, H = 320, pad={l:52,r:18,t:16,b:36};
    const sx = (W-pad.l-pad.r)/(fview.x1-fview.x0), sy = (H-pad.t-pad.b)/(fview.y1-fview.y0);
    return {W,H,pad,
      x: v => pad.l + (v-fview.x0)*sx,
      y: v => H-pad.b - (v-fview.y0)*sy,
      xInv: px => fview.x0 + (px-pad.l)/sx,
      yInv: py => fview.y0 + (H-pad.b-py)/sy};
  }

  function renderFancy(){
    fsvg.innerHTML='';
    const visible = filteredRows().map(r=>Object.assign({}, r, effective(r))).filter(r=>RESTAURANT_FORMATS.has(r.format));
    if(visible.length===0) return;
    const pts = visible.map(r=>({r, x: venueAvgPrice(r.venue), y:r.protein_cost})).filter(p=>p.x!==null);
    const {W,H,pad,x,y} = fancyGeom();
    const xSpan = fview.x1-fview.x0, ySpan = fview.y1-fview.y0;
    fsvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const defs = el('defs',{});
    const cp = el('clipPath',{id:'fancy-clip'});
    cp.appendChild(el('rect',{x:pad.l,y:pad.t,width:Math.max(0,W-pad.l-pad.r),height:Math.max(0,H-pad.t-pad.b)}));
    defs.appendChild(cp); fsvg.appendChild(defs);
    for(let i=0;i<=4;i++){
      const v = fview.x0 + xSpan*i/4, gx = x(v);
      fsvg.appendChild(el('line',{x1:gx,x2:gx,y1:pad.t,y2:H-pad.b,class:'grid-line'}));
      const t = el('text',{x:gx,y:H-pad.b+16,class:'axis-label','text-anchor':'middle'}); t.textContent=niceTick(v,xSpan); fsvg.appendChild(t);
    }
    for(let i=0;i<=4;i++){
      const v = fview.y0 + ySpan*i/4, gy = y(v);
      fsvg.appendChild(el('line',{x1:pad.l,x2:W-pad.r,y1:gy,y2:gy,class:'grid-line'}));
      const t = el('text',{x:pad.l-8,y:gy+3,class:'axis-label','text-anchor':'end'}); t.textContent=niceTick(v,ySpan); fsvg.appendChild(t);
    }
    const xl = el('text',{x:(W+pad.l-pad.r)/2,y:H-4,class:'axis-label','text-anchor':'middle'}); xl.textContent="💅 venue's avg menu price (fanciness proxy)"; fsvg.appendChild(xl);
    const yl = el('text',{x:12,y:H/2,class:'axis-label','text-anchor':'middle',transform:`rotate(-90 12 ${H/2})`}); yl.textContent='🥩 $ per 20g protein'; fsvg.appendChild(yl);
    const marks = el('g',{'clip-path':'url(#fancy-clip)'});
    pts.forEach(p=>{
      const c = el('circle',{cx:x(p.x).toFixed(1), cy:y(p.y).toFixed(1), r:5, fill:colorFor(p.r.format), 'fill-opacity':0.7, class:'dot'});
      c.addEventListener('mousemove',(ev)=>showTooltip(ev, p.r, {price:p.r.price, energy_cost:p.r.energy_cost, protein_cost:p.r.protein_cost, markup:p.r.markup}));
      c.addEventListener('mouseleave', hideTooltip);
      marks.appendChild(c);
    });
    fsvg.appendChild(marks);
    const zl = document.getElementById('fancy-zoomlbl');
    if(zl) zl.textContent = (xSpan >= FANCY_MAX.x*0.999) ? '' : (FANCY_MAX.x/xSpan).toFixed(1)+'× zoom';
  }
  attachZoom(fsvg, fview, {x:FANCY_MAX.x, y:FANCY_MAX.y}, renderFancy, fancyGeom);
  ['zin','zout','zreset'].forEach(k=>{
    const b = document.getElementById('fancy-'+k);
    if(!b) return;
    b.addEventListener('click', ()=>{
      if(k==='zreset'){ fview.x0=0; fview.x1=FANCY_MAX.x; fview.y0=0; fview.y1=FANCY_MAX.y; }
      else zoomAt(fview, {x:FANCY_MAX.x,y:FANCY_MAX.y}, (fview.x0+fview.x1)/2, (fview.y0+fview.y1)/2, k==='zin' ? 1/1.5 : 1.5);
      renderFancy();
    });
  });

  // ================= TELLS CHEATSHEET =================
  const TELLS = {
    protein_on_starch: {gen:"Menu states skewer/piece counts or an explicit gram/serving claim ('2 skewers', 'serves 2'); reviews use concrete size language ('generous portions', 'loaded with').",
      sting:"One-line description with no protein amount; identical price across dishes with obviously different meat cuts."},
    wrap_sandwich: {gen:"Wrap names the protein weight or shows a thick visible filling in photos; rasam/side soup bundled at no extra charge.",
      sting:"Combo pricing bundles fries+drink but never states patty/protein size; 'kathi roll' or 'wrap' with a single vague adjective ('protein') instead of a cut name."},
    soup_bowl: {gen:"Broth names the specific cut (brisket, chashu, short rib) and a piece count; lunch-special price matches the regular bowl size, not a shrunk one.",
      sting:"Description says just 'broth' with no protein amount; lunch-special pricing is meaningfully cheaper than dinner — usually a smaller bowl, not a discount."},
    composed_small_plates: {gen:"Bundled boxes (bento, combo platters) beat à la carte small plates on protein/$ every time in this dataset — a box with 3+ components is the tell.",
      sting:"Per-piece pricing (2pcs, 1 skewer) — labour cost dominates the smallest portions here; this format has the worst protein/$ of the six by design (SPEC.md), so treat any single-item order as a snack, not a meal."},
    whole_item_family: {gen:"Menu explicitly says 'serves 2' / 'family pack' / names a diner count — this is the strongest single signal in the whole dataset (Darvish's platter, Shamshiri's family pack).",
      sting:"The same whole-item price ordered solo collapses in value — split 3-4 ways it's excellent, alone it's mediocre. Never order these for one."},
  };
  function renderTells(){
    const wrap = document.getElementById('tells-wrap');
    wrap.innerHTML = Object.keys(TELLS).map(f=>`
      <div class="tier-col">
        <h3 style="color:${'var(--c-'+f+')'}"><b>${fmtLabel(f)}</b></h3>
        <div class="tell-block"><div class="tell-label good">😍 Generous, before you order</div><div class="tell-text">${TELLS[f].gen}</div></div>
        <div class="tell-block"><div class="tell-label bad">😤 Stingy, before you order</div><div class="tell-text">${TELLS[f].sting}</div></div>
      </div>`).join('') + `
      <div class="tier-col">
        <h3 style="color:var(--c-grocery_ready)"><b>🛒 Grocery — home-cooked vs ready-to-eat</b></h3>
        <div class="tell-block"><div class="tell-label good">🏅 The one universal tell</div><div class="tell-text">Cooking your own protein runs 3–10x cheaper per protein unit than any restaurant format in this dataset. Among ready-to-eat options, a whole rotisserie chicken (sold by weight, minimal per-unit labour) beats individually-portioned items like sushi or a sandwich — same "whole item vs small portion" pattern that shows up in restaurant formats too.</div></div>
      </div>`;
  }

  // ================= WEIGHTED PRIORITY =================
  const wEnergyEl = document.getElementById('w-energy');
  const wProteinEl = document.getElementById('w-protein');
  const wEnergyVal = document.getElementById('w-energy-val');
  const wProteinVal = document.getElementById('w-protein-val');
  function syncWeightLabels(){
    wEnergyVal.textContent = wEnergyEl.value + '%';
    wProteinVal.textContent = wProteinEl.value + '%';
  }
  [wEnergyEl, wProteinEl].forEach(elm=>elm && elm.addEventListener('input', ()=>{
    syncWeightLabels();
    renderPicks();
  }));

  function renderPicks(){
    const wrap = document.getElementById('picks-wrap');
    if(!wrap) return;
    const wE = (+wEnergyEl.value)/100, wP = (+wProteinEl.value)/100;
    const visible = filteredRows().map(r=>Object.assign({}, r, effective(r)));
    if(visible.length===0){ wrap.innerHTML = '<div class="tier-row empty">Nothing to show in current filters.</div>'; return; }
    const minE = Math.min(...visible.map(r=>r.energy_cost)), maxE = Math.max(...visible.map(r=>r.energy_cost));
    const minP = Math.min(...visible.map(r=>r.protein_cost)), maxP = Math.max(...visible.map(r=>r.protein_cost));
    visible.forEach(r=>{
      const nE = maxE>minE ? (r.energy_cost-minE)/(maxE-minE) : 0;
      const nP = maxP>minP ? (r.protein_cost-minP)/(maxP-minP) : 0;
      r.match = wE*nE + wP*nP;
    });
    const byFormat = {};
    visible.forEach(r=>{ if(!byFormat[r.format] || r.match < byFormat[r.format].match) byFormat[r.format]=r; });
    wrap.innerHTML = Object.values(byFormat).sort((a,b)=>a.match-b.match).map(r=>`
      <div class="tier-row">
        <div class="t-fmt">${fmtLabel(r.format)}</div>
        <div class="t-dish">${r.dish_name}</div>
        <div class="t-meta">${r.venue} · 💵 $${r.price.toFixed(2)} · 🔥 $${r.energy_cost.toFixed(2)}/1000kcal · 🥩 $${r.protein_cost.toFixed(2)}/unit</div>
      </div>`).join('');
  }
  syncWeightLabels();


  // ═══════════════════════════════════════════════════════════════════════
  // PRO MODE
  // Everything below only runs while state.pro is true. Base mode is the
  // simple instrument; pro adds the NYFood-style personal-scoring layer:
  // six weighted dimensions, a venue ranking, a continuous budget ceiling,
  // cuisine/search filters and per-row provenance.
  // ═══════════════════════════════════════════════════════════════════════

  // Each dimension returns "bigger is better" so normalization is uniform;
  // costs and distances are therefore negated at the source.
  const DIMS = [
    {key:'energy',  emoji:'🔥', label:'Cheap calories',   noun:'per 1000 kcal',  get:r=>-r.energy_cost,  show:r=>'$'+r.energy_cost.toFixed(2)},
    {key:'protein', emoji:'🥩', label:'Cheap protein',    noun:'per 20g protein',get:r=>-r.protein_cost, show:r=>'$'+r.protein_cost.toFixed(2)},
    {key:'veg',     emoji:'🥦', label:'Vegetables on it', noun:'of vegetables',  get:r=>r.veg_g||0,      show:r=>(r.veg_g||0)+'g'},
    {key:'fill',    emoji:'💪', label:'Actually a meal',  noun:'of protein',     get:r=>r.protein_g,     show:r=>r.protein_g+'g'},
    {key:'near',    emoji:'📍', label:'Close by',         noun:'away',           get:r=>-r.distance_m,   show:r=>r.distance_m+'m'},
    {key:'spend',   emoji:'💵', label:'Low total spend',  noun:'on the bill',    get:r=>-r.price,        show:r=>'$'+r.price.toFixed(2)}
  ];
  DIMS.forEach(d=>{ state.weights[d.key] = 5; });

  function applyScores(list){
    if(!list.length) return list;
    DIMS.forEach(d=>{
      const vals = list.map(d.get);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      list.forEach((r,i)=>{ r['n_'+d.key] = hi>lo ? (vals[i]-lo)/(hi-lo) : 1; });
    });
    const total = DIMS.reduce((s,d)=>s+state.weights[d.key], 0);
    list.forEach(r=>{
      r.score = total>0 ? DIMS.reduce((s,d)=>s + state.weights[d.key]*r['n_'+d.key], 0)/total*100 : 0;
    });
    return list;
  }

  function scoredVisible(){
    return applyScores(filteredRows().map(r=>Object.assign({}, r, effective(r))));
  }

  // ---- what a slider actually buys you (2) ----
  // "importance 5" is abstract. This answers it concretely: hold the other five
  // sliders where they are, put this one at 1, and report what the top-ranked dish
  // then scores on THIS dimension; repeat at 10. The gap between the two numbers is
  // the whole value of the slider, in the dimension's own units.
  function sliderPreview(dim){
    const base = filteredRows().map(r=>Object.assign({}, r, effective(r)));
    if(base.length < 2) return null;
    const saved = state.weights[dim.key];
    const at = w => {
      state.weights[dim.key] = w;
      const copy = base.map(r=>Object.assign({}, r));
      applyScores(copy);
      return copy.reduce((a,b)=> b.score > a.score ? b : a);
    };
    const lo = at(1), hi = at(10);
    state.weights[dim.key] = saved;
    return {lo, hi, same: lo.dish_name===hi.dish_name && lo.venue===hi.venue};
  }

  // ---- weight sliders ----
  const weightsWrap = document.getElementById('weights');
  const weightsPreview = document.getElementById('weights-preview');
  function buildWeights(){
    if(!weightsWrap) return;
    weightsWrap.innerHTML = DIMS.map(d=>`
      <div class="wctl">
        <div class="lbl"><span>${d.emoji} ${d.label}</span><span class="val" id="wv-${d.key}">${state.weights[d.key]}</span></div>
        <input type="range" id="w-${d.key}" min="0" max="10" step="1" value="${state.weights[d.key]}">
        <div class="whelp" id="wp-${d.key}"></div>
      </div>`).join('');
    renderSliderPreviews();
    DIMS.forEach(d=>{
      document.getElementById('w-'+d.key).addEventListener('input', ev=>{
        state.weights[d.key] = +ev.target.value;
        document.getElementById('wv-'+d.key).textContent = state.weights[d.key];
        syncPreview(); renderSliderPreviews(); renderTable(); renderVenues(); renderPickBadges();
      });
    });
    syncPreview();
  }
  function renderSliderPreviews(){
    if(!state.pro || !weightsWrap || !weightsWrap.children.length) return;
    DIMS.forEach(d=>{
      const host = document.getElementById('wp-'+d.key);
      if(!host) return;
      const p = sliderPreview(d);
      if(!p){ host.textContent = 'Not enough dishes in view to compare.'; return; }
      host.innerHTML = p.same
        ? `Either way your top pick is <b>${d.show(p.hi)}</b> ${d.noun}; nothing in view changes hands on this slider right now.`
        : `At <b>1</b>: ${d.show(p.lo)} ${d.noun} <span class="pv-dish">${p.lo.dish_name}</span><br>
           At <b>10</b>: <b>${d.show(p.hi)}</b> ${d.noun} <span class="pv-dish">${p.hi.dish_name}</span>`;
    });
  }

  function syncPreview(){
    if(!weightsPreview) return;
    const on = DIMS.filter(d=>state.weights[d.key]>0);
    const off = DIMS.filter(d=>state.weights[d.key]===0);
    const total = on.reduce((s,d)=>s+state.weights[d.key],0);
    if(!on.length){ weightsPreview.textContent = 'Every slider is at 0; no dimension counts, so every dish scores the same. Raise at least one.'; return; }
    const parts = on.slice().sort((a,b)=>state.weights[b.key]-state.weights[a.key])
      .map(d=>`${d.emoji} ${d.label} ${(state.weights[d.key]/total*100).toFixed(0)}%`);
    weightsPreview.textContent = 'Counting: ' + parts.join(' · ') + (off.length ? '  |  ignoring: ' + off.map(d=>d.emoji+' '+d.label).join(', ') : '');
  }
  const weightsReset = document.getElementById('weights-reset');
  if(weightsReset) weightsReset.addEventListener('click', ()=>{
    DIMS.forEach(d=>{ state.weights[d.key]=5; });
    buildWeights(); renderTable(); renderVenues(); renderPickBadges();
  });

  // ---- numbered picks on the frontier chart ----
  function renderPickBadges(){
    const old = svg.querySelector('#pick-layer');
    if(old) old.remove();
    if(!state.pro) return;
    const list = scoredVisible().sort((a,b)=>b.score-a.score).slice(0,5);
    if(!list.length) return;
    const {x,y} = chartGeom();
    const g = el('g',{id:'pick-layer'});
    list.forEach((r,i)=>{
      const cx = x(r.energy_cost), cy = y(r.protein_cost) - 13;
      g.appendChild(el('circle',{cx:cx.toFixed(1), cy:cy.toFixed(1), r:8, class:'pick-badge'}));
      const t = el('text',{x:cx.toFixed(1), y:(cy+3.2).toFixed(1), class:'pick-badge-txt'});
      t.textContent = i+1;
      g.appendChild(t);
    });
    svg.appendChild(g);
  }

  // ---- budget panel (continuous, replaces the fixed tiers) ----
  function renderBudget(){
    const wrap = document.getElementById('budget-grid');
    if(!wrap) return;
    const visible = filteredRows().map(r=>Object.assign({}, r, effective(r)));
    if(!visible.length){ wrap.innerHTML = '<div class="tier-row empty">Nothing at this budget in the current filters. Raise 💰 max spend or loosen a filter above.</div>'; return; }
    const byFormat = {};
    visible.forEach(r=>{ if(!byFormat[r.format] || r.protein_cost < byFormat[r.format].protein_cost) byFormat[r.format]=r; });
    const ceiling = state.maxSpend >= SPEND_MAX ? 'any price' : '$'+state.maxSpend;
    wrap.innerHTML = Object.values(byFormat).sort((a,b)=>a.protein_cost-b.protein_cost).map((r,i)=>`
      <div class="tier-col">
        <h3>${i===0?'🥇 ':''}${fmtLabel(r.format)} <b style="font-size:12px">≤ ${ceiling}</b></h3>
        <div class="tier-row">
          <div class="t-dish">${r.dish_name}</div>
          <div class="t-meta">${r.venue} · 💵 $${r.price.toFixed(2)} · 🥩 ${r.protein_g}g · $${r.protein_cost.toFixed(2)}/unit · 📍 ${r.distance_m}m</div>
        </div>
      </div>`).join('');
  }

  // ---- venue ranking ----
  function renderVenues(){
    const tbl = document.getElementById('venues-tbl');
    if(!tbl) return;
    const best = {};
    scoredVisible().forEach(r=>{ if(!best[r.venue] || r.score > best[r.venue].score) best[r.venue] = r; });
    const list = Object.values(best).sort((a,b)=>b.score-a.score);
    const n = document.getElementById('venues-n');
    if(n) n.textContent = `${list.length} venues with a matching dish`;
    tbl.querySelector('thead').innerHTML = '<tr><th style="width:30px">#</th><th>🏪 Venue</th><th>🍽️ Its best dish for you</th><th>📍 Distance</th><th>💵 Price</th><th>🥩 $/protein unit</th><th>🎚️ Your score</th></tr>';
    tbl.querySelector('tbody').innerHTML = list.length ? list.map((r,i)=>`
      <tr>
        <td class="num">${i<5?`<span class="pickno">${i+1}</span>`:i+1}</td>
        <td class="dish-cell"><b>${r.venue}</b><span class="venue">${r.cuisine}</span></td>
        <td class="dish-cell"><b style="font-weight:500">${r.dish_name}</b><span class="venue">${fmtLabel(r.format)} · 🥩 ${r.protein_g}g</span></td>
        <td class="num">📍 ${r.distance_m}m</td>
        <td class="num">💵 $${r.price.toFixed(2)}</td>
        <td class="num">🥩 $${r.protein_cost.toFixed(2)}</td>
        <td class="score-cell"><span class="scorebar" style="width:${r.score*0.34}px"></span>${r.score.toFixed(0)}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="tier-row empty">No venue has a dish matching every filter.</td></tr>';
  }

  // ---- cuisine multi-select ----
  const ALL_CUISINES = [...new Set(rows.map(r=>r.cuisine))].sort();
  function buildCuisineSelect(){
    const host = document.getElementById('f-cuisine');
    if(!host) return;
    state.cuisines = new Set(ALL_CUISINES);
    const counts = {};
    rows.forEach(r=>{ counts[r.cuisine] = (counts[r.cuisine]||0)+1; });
    host.innerHTML = `
      <button type="button" class="msel-btn" id="cuisine-btn">all cuisines</button>
      <div class="msel-pop">
        <div class="msel-actions">
          <button type="button" data-act="all">All</button>
          <button type="button" data-act="none">None</button>
          <button type="button" data-act="invert">Invert</button>
        </div>
        <div class="msel-list">${ALL_CUISINES.map(c=>`
          <label class="msel-opt"><input type="checkbox" value="${c}" checked>${c}<span class="cnt">${counts[c]}</span></label>`).join('')}</div>
      </div>`;
    const btn = host.querySelector('#cuisine-btn');
    const boxes = [...host.querySelectorAll('input[type=checkbox]')];
    function sync(){
      state.cuisines = new Set(boxes.filter(b=>b.checked).map(b=>b.value));
      btn.textContent = state.cuisines.size===ALL_CUISINES.length ? 'all cuisines'
        : state.cuisines.size===0 ? 'none selected'
        : state.cuisines.size===1 ? [...state.cuisines][0]
        : `${state.cuisines.size} of ${ALL_CUISINES.length} cuisines`;
      renderAll();
    }
    btn.addEventListener('click', e=>{ e.stopPropagation(); host.classList.toggle('open'); });
    host.querySelectorAll('.msel-actions button').forEach(b=>b.addEventListener('click', ()=>{
      const a = b.dataset.act;
      boxes.forEach(box=>{ box.checked = a==='all' ? true : a==='none' ? false : !box.checked; });
      sync();
    }));
    boxes.forEach(b=>b.addEventListener('change', sync));
    document.addEventListener('click', e=>{ if(!host.contains(e.target)) host.classList.remove('open'); });
  }
  buildCuisineSelect();

  // ---- remaining pro controls ----
  const spendSlider = document.getElementById('spend-slider');
  const spendVal = document.getElementById('spend-val');
  if(spendSlider) spendSlider.addEventListener('input', ()=>{
    state.maxSpend = +spendSlider.value;
    spendVal.textContent = state.maxSpend >= SPEND_MAX ? 'any' : '$'+state.maxSpend;
    renderAll();
  });

  const qInput = document.getElementById('f-q');
  if(qInput) qInput.addEventListener('input', ()=>{ state.query = qInput.value.trim(); renderAll(); });

  const sharedChips = document.getElementById('shared-chips');
  if(sharedChips){
    [{k:'all',l:'include shared platters'},{k:'solo',l:'solo diner only'}].forEach(opt=>{
      const chip = document.createElement('button');
      chip.className = 'chip' + (opt.k===state.shared ? ' active':'');
      chip.textContent = opt.l;
      chip.addEventListener('click', ()=>{
        state.shared = opt.k;
        [...sharedChips.children].forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        renderAll();
      });
      sharedChips.appendChild(chip);
    });
  }

  // ---- ingredient exclusions (3) ----
  const exclWrap = document.getElementById('excl-chips');
  if(exclWrap){
    const counts = {};
    rows.forEach(r=>r.ingredients.forEach(k=>{ counts[k]=(counts[k]||0)+1; }));
    INGREDIENTS.forEach(g=>{
      const chip = document.createElement('button');
      chip.className = 'chip excl active';
      chip.innerHTML = `${g.emoji} ${g.label}<span class="cnt">${counts[g.key]||0}</span>`;
      chip.title = `Click to hide every dish whose name or component note mentions ${g.label}.`;
      chip.addEventListener('click', ()=>{
        if(state.excluded.has(g.key)){ state.excluded.delete(g.key); chip.classList.add('active'); chip.classList.remove('off'); }
        else { state.excluded.add(g.key); chip.classList.remove('active'); chip.classList.add('off'); }
        renderAll();
      });
      exclWrap.appendChild(chip);
    });
    const untagged = rows.filter(r=>!r.ingredients.length).length;
    const note = document.getElementById('excl-note');
    if(note) note.textContent = `Keyword-derived from each dish's name and component note, not a curated field. ${untagged} of ${rows.length} dishes match no keyword; those are never hidden, so excluding 🐖 pork leaves anything whose menu text never says pork.`;
  }

  // ---- the toggle ----
  const proBtn = document.getElementById('pro-toggle');
  const proHint = document.getElementById('pro-hint');
  function applyPro(on, firstRun){
    state.pro = on;
    document.documentElement.setAttribute('data-pro', on ? 'on' : 'off');
    proBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    proHint.textContent = on
      ? 'six weighted dimensions, venue ranking, budget slider, cuisine + search filters, per-row sources'
      : 'off; the simple view. Turn it on for weighted scoring, venue ranking and finer filters.';
    try{ localStorage.setItem('carlton.pro', on ? 'on' : 'off'); }catch(e){}
    if(on) buildWeights();
    if(!firstRun) renderAll();
    // the map sits in a panel whose width does not change, but Leaflet still
    // needs a nudge after the page reflows around the pro panels
    setTimeout(()=>map.invalidateSize(), 60);
  }
  proBtn.addEventListener('click', ()=>applyPro(!state.pro));
  // Pro is the default: a first-time visitor gets the full instrument, and only an
  // explicit "off" stored from the toggle takes it away.
  let proInit = true;
  try{ proInit = localStorage.getItem('carlton.pro') !== 'off'; }catch(e){}
  applyPro(proInit, true);

  function renderAll(){
    renderChart(); renderTable(); renderSpread(); renderMatrix(); renderFancy(); renderTells();
    renderPickBadges();   // no-ops and clears itself when pro is off
    if(state.pro){ renderBudget(); renderVenues(); renderSliderPreviews(); }
    else { renderTiers(); renderPicks(); }
  }
  let resizeTimer;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{ buildChartOnce(); renderChart(); renderPickBadges(); renderFancy(); }, 150);
  });
  renderAll();
})();
