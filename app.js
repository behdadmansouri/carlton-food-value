(function(){
  const D = window.CARLTON_DATA;
  const FORMATS = ["protein_on_starch","wrap_sandwich","soup_bowl","composed_small_plates","whole_item_family","grocery_home","grocery_ready"];
  const FORMAT_LABEL = {
    protein_on_starch:"Protein on starch", wrap_sandwich:"Wrap / sandwich", soup_bowl:"Soup bowl",
    composed_small_plates:"Composed small plates", whole_item_family:"Whole item / family",
    grocery_home:"Grocery — home-cooked", grocery_ready:"Grocery — ready-to-eat"
  };
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

  // ---- state ----
  const state = { maxDist: 1000, confs: new Set(CONF), formats: new Set(FORMATS), sortKey:"protein_cost", sortDir:1, channel:"dine_in",
    // ---- pro-mode state; inert while pro is off, because every pro control
    // starts at its most permissive value and nothing else reads them ----
    pro: false, maxSpend: 60, cuisines: null, query: "", shared: "all",
    weights: {} };

  const SPEND_MAX = 60;   // the max-spend slider's ceiling; at it, the filter is off

  function channelMult(){ return CHANNELS.find(c=>c.key===state.channel).mult; }
  function effective(r){
    const applies = RESTAURANT_FORMATS.has(r.format);
    const price = applies ? r.price_menu * channelMult() : r.price_menu;
    const energy_cost = price / (r.kcal/1000);
    const protein_cost = price / (r.protein_g/20);
    return {price, energy_cost, protein_cost};
  }

  // ================= MAP =================
  const map = L.map('map', {scrollWheelZoom:false}).setView([D.center.lat, D.center.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const radiusCircle = L.circle([D.center.lat, D.center.lng], {radius:1000, color:'#e0964a', weight:1.5, dashArray:'4 4', fill:true, fillOpacity:.04}).addTo(map);
  L.marker([D.center.lat, D.center.lng], {icon: L.divIcon({className:'', html:'<div style="width:14px;height:14px;border-radius:50%;background:#e8ecee;border:2px solid #0f1214"></div>', iconSize:[14,14]})})
    .addTo(map).bindPopup('<b>120 Carlton St</b><br>Center point');

  function colorFor(fmt){ return getComputedStyle(document.documentElement).getPropertyValue('--c-'+fmt).trim(); }

  const venueMarkers = [];
  function addVenueMarkers(){
    D.venues.forEach(v=>{
      const best = v.dishes.reduce((a,b)=> (a.protein_cost < b.protein_cost ? a : b));
      const m = L.circleMarker([v.lat, v.lng], {
        radius:7, color:colorFor(best.format), weight:2, fillColor:colorFor(best.format), fillOpacity:.55
      }).addTo(map);
      const dishList = v.dishes.map(d=>`${d.dish_name} — $${d.price.toFixed(2)} <span class="tag">${d.confidence}</span>`).join('<br>');
      m.bindPopup(`<b>${v.name}</b><br><span style="color:#98a3a8">${v.cuisine} · ${v.distance_m}m</span><br><br>${dishList}`);
      m._distance = v.distance_m;
      venueMarkers.push(m);
    });
    const g = L.circleMarker([D.grocery_store.lat, D.grocery_store.lng], {
      radius:8, color:colorFor('grocery_ready'), weight:2, fillColor:colorFor('grocery_ready'), fillOpacity:.7
    }).addTo(map).bindPopup(`<b>${D.grocery_store.name}</b><br>Grocery baseline (home-cooked + ready-to-eat) · ${D.grocery_store.distance_m}m`);
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
        if(state.maxSpend < SPEND_MAX && effective(r).price > state.maxSpend) return false;
        if(state.query){
          const q = state.query.toLowerCase();
          if(!(r.dish_name+' '+r.venue+' '+r.cuisine).toLowerCase().includes(q)) return false;
        }
      }
      return true;
    });
  }

  function chartGeom(){
    const W = svg.clientWidth || 600, H = 420;
    const pad = {l:52,r:18,t:16,b:38};
    return {W,H,pad,
      x: v => pad.l + (v/axisMax.x) * (W-pad.l-pad.r),
      y: v => H-pad.b - (v/axisMax.y) * (H-pad.t-pad.b)
    };
  }

  function buildChartOnce(){
    svg.innerHTML='';
    const {W,H,pad,x,y} = chartGeom();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const xTicks=5,yTicks=5;
    for(let i=0;i<=xTicks;i++){
      const v = axisMax.x*i/xTicks, gx = x(v);
      svg.appendChild(el('line',{x1:gx,x2:gx,y1:pad.t,y2:H-pad.b,class:'grid-line'}));
      const t = el('text',{x:gx,y:H-pad.b+16,class:'axis-label','text-anchor':'middle'}); t.textContent='$'+v.toFixed(0); svg.appendChild(t);
    }
    for(let i=0;i<=yTicks;i++){
      const v = axisMax.y*i/yTicks, gy = y(v);
      svg.appendChild(el('line',{x1:pad.l,x2:W-pad.r,y1:gy,y2:gy,class:'grid-line'}));
      const t = el('text',{x:pad.l-8,y:gy+3,class:'axis-label','text-anchor':'end'}); t.textContent='$'+v.toFixed(0); svg.appendChild(t);
    }
    const xl = el('text',{x:(W+pad.l-pad.r)/2,y:H-4,class:'axis-label','text-anchor':'middle'}); xl.textContent='$ per 1000 kcal'; svg.appendChild(xl);
    const yl = el('text',{x:12,y:(H)/2,class:'axis-label','text-anchor':'middle',transform:`rotate(-90 12 ${H/2})`}); yl.textContent='$ per 20g protein'; svg.appendChild(yl);

    const frontierPath = el('path',{class:'frontier-line', d:''});
    svg.appendChild(frontierPath);
    svg._frontierPath = frontierPath;

    svg._dots = {};
    rows.forEach((r)=>{
      const key = r.venue+'|'+r.dish_name;
      const c = el('circle',{cx:-100,cy:-100,r:5, fill:colorFor(r.format), class:'dot'+(r.confidence==='low'?' low-conf':'')});
      c._row = r;
      svg.appendChild(c);
      svg._dots[key] = c;
    });
  }
  buildChartOnce();

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

    rows.forEach(r=>{
      const key = r.venue+'|'+r.dish_name;
      const c = svg._dots[key];
      if(!c) return;
      const isVisible = visibleKeys.has(key);
      const ef = effective(r);
      const onFrontier = frontierRowKeys.has(key);
      const radius = 4 + Math.min(6, Math.sqrt(r.kcal)/14);
      c.setAttribute('cx', x(ef.energy_cost).toFixed(1));
      c.setAttribute('cy', y(ef.protein_cost).toFixed(1));
      c.setAttribute('r', radius.toFixed(1));
      c.setAttribute('fill-opacity', isVisible ? (onFrontier ? 0.95 : (r.format.startsWith('grocery') ? 0.9 : 0.55)) : 0);
      c.style.pointerEvents = isVisible ? 'auto' : 'none';
      c._data = {r, energy_cost: ef.energy_cost, protein_cost: ef.protein_cost, price: ef.price};
    });
  }

  function showTooltip(ev, r, eff){
    tooltip.style.opacity = 1;
    const rect = svg.getBoundingClientRect();
    tooltip.style.left = (ev.clientX - rect.left + 14) + 'px';
    tooltip.style.top = (ev.clientY - rect.top + 10) + 'px';
    tooltip.innerHTML = `<b>${r.dish_name}</b>
      <div class="tt-meta">${r.venue} · ${r.cuisine} · ${r.distance_m}m</div>
      <div class="tt-metrics">
        <div><span>Price now</span>$${eff.price.toFixed(2)}</div>
        <div><span>kcal</span>${r.kcal}</div>
        <div><span>Protein</span>${r.protein_g}g</div>
      </div>
      <div class="tt-metrics">
        <div><span>$/1000kcal</span>$${eff.energy_cost.toFixed(2)}</div>
        <div><span>$/protein unit</span>$${eff.protein_cost.toFixed(2)}</div>
      </div>
      <div class="tt-meta" style="margin-top:6px">confidence: ${r.confidence}${r.multi_meal?' · multi-meal':''}</div>`;
  }
  function hideTooltip(){ tooltip.style.opacity = 0; }
  svg.addEventListener('mousemove', (ev)=>{
    const t = ev.target;
    if(t && t.tagName==='circle' && t._data){
      const {r, energy_cost, protein_cost, price} = t._data;
      showTooltip(ev, r, {price, energy_cost, protein_cost});
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
    btn.textContent = c.label;
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
    chip.className = 'chip active'; chip.textContent = c;
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
    chip.innerHTML = `<span class="swatch" style="background:${'var(--c-'+f+')'}"></span>${FORMAT_LABEL[f]}`;
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
      return (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir;
    });
    const tn = document.getElementById('tbl-n');
    if(tn) tn.textContent = state.pro ? `${visible.length} of ${rows.length} dishes · click a column to sort · click ▸ for the source note`
                                      : 'click a column to sort';
    tbody.innerHTML = visible.map((r,i)=>`
      <tr data-idx="${i}">
        <td class="pro-only"><button class="expander" type="button" aria-expanded="false" aria-label="Show source note">&#9656;</button></td>
        <td class="dish-cell"><b>${r.dish_name}</b><span class="venue">${r.venue} · ${r.cuisine}</span></td>
        <td><span class="tag">${FORMAT_LABEL[r.format]}</span></td>
        <td class="num">${r.distance_m}m</td>
        <td class="num">$${r.price.toFixed(2)}</td>
        <td class="num">${r.kcal}</td>
        <td class="num">${r.protein_g}g</td>
        <td class="num pro-only">${r.veg_g ? r.veg_g+'g' : '—'}</td>
        <td class="num">$${r.energy_cost.toFixed(2)}</td>
        <td class="num">$${r.protein_cost.toFixed(2)}</td>
        <td class="score-cell pro-only"><span class="scorebar" style="width:${(r.score||0)*0.34}px"></span>${(r.score||0).toFixed(0)}</td>
        <td class="conf-${r.confidence}">${r.confidence}${r.multi_meal?' · multi-meal':''}</td>
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
    det.innerHTML = `<td colspan="12"><div class="dlabel">source note · ${r.venue}${r.address?' · '+r.address:''}</div>${r.note||'No note recorded for this row.'}</td>`;
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
        return `<div class="tier-col"><h3>At or under <b>$${tier}</b></h3><div class="tier-row empty">Nothing found at this price in the current filters.</div></div>`;
      }
      const byFormat = {};
      candidates.forEach(r=>{
        if(!byFormat[r.format] || r.protein_cost < byFormat[r.format].protein_cost) byFormat[r.format] = r;
      });
      const rowsHtml = Object.values(byFormat).sort((a,b)=>a.protein_cost-b.protein_cost).map(r=>`
        <div class="tier-row">
          <div class="t-fmt">${FORMAT_LABEL[r.format]}</div>
          <div class="t-dish">${r.dish_name}</div>
          <div class="t-meta">${r.venue} · $${r.price.toFixed(2)} · ${r.protein_g}g protein · $${r.protein_cost.toFixed(2)}/unit</div>
        </div>`).join('');
      return `<div class="tier-col"><h3>Best per format, at or under <b>$${tier}</b></h3>${rowsHtml}</div>`;
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
        return `<div class="spread-dot" title="${r.dish_name} — $${r.protein_cost.toFixed(2)}/unit (${r.venue})" style="left:${left}%;background:${'var(--c-'+fmt+')'}"></div>`;
      }).join('');
      const medLeft = (median/maxPC*100).toFixed(1);
      return `<div class="spread-row">
        <div class="spread-label">${FORMAT_LABEL[fmt]}<div class="n">n=${items.length}, median $${median.toFixed(2)}</div></div>
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
      formats.map(f=>`<th>${FORMAT_LABEL[f]}</th>`).join('') + '</tr></thead><tbody>';
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
  function renderFancy(){
    fsvg.innerHTML='';
    const visible = filteredRows().map(r=>Object.assign({}, r, effective(r))).filter(r=>RESTAURANT_FORMATS.has(r.format));
    if(visible.length===0) return;
    const pts = visible.map(r=>({r, x: venueAvgPrice(r.venue), y:r.protein_cost})).filter(p=>p.x!==null);
    const W = fsvg.clientWidth || 600, H = 320, pad={l:52,r:18,t:16,b:36};
    const maxX = Math.max(...pts.map(p=>p.x))*1.1, maxY = Math.max(...pts.map(p=>p.y))*1.12;
    const x = v => pad.l + (v/maxX)*(W-pad.l-pad.r);
    const y = v => H-pad.b - (v/maxY)*(H-pad.t-pad.b);
    fsvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for(let i=0;i<=4;i++){
      const gx = pad.l + i*(W-pad.l-pad.r)/4;
      fsvg.appendChild(el('line',{x1:gx,x2:gx,y1:pad.t,y2:H-pad.b,class:'grid-line'}));
      const t = el('text',{x:gx,y:H-pad.b+16,class:'axis-label','text-anchor':'middle'}); t.textContent='$'+(maxX*i/4).toFixed(0); fsvg.appendChild(t);
    }
    for(let i=0;i<=4;i++){
      const gy = pad.t + i*(H-pad.t-pad.b)/4;
      fsvg.appendChild(el('line',{x1:pad.l,x2:W-pad.r,y1:gy,y2:gy,class:'grid-line'}));
      const t = el('text',{x:pad.l-8,y:gy+3,class:'axis-label','text-anchor':'end'}); t.textContent='$'+(maxY*(4-i)/4).toFixed(0); fsvg.appendChild(t);
    }
    const xl = el('text',{x:(W+pad.l-pad.r)/2,y:H-4,class:'axis-label','text-anchor':'middle'}); xl.textContent="venue's avg menu price (fanciness proxy)"; fsvg.appendChild(xl);
    const yl = el('text',{x:12,y:H/2,class:'axis-label','text-anchor':'middle',transform:`rotate(-90 12 ${H/2})`}); yl.textContent='$ per 20g protein'; fsvg.appendChild(yl);
    pts.forEach(p=>{
      const c = el('circle',{cx:x(p.x).toFixed(1), cy:y(p.y).toFixed(1), r:5, fill:colorFor(p.r.format), 'fill-opacity':0.7, class:'dot'});
      c.addEventListener('mousemove',(ev)=>showTooltip(ev, p.r, {price:p.r.price, energy_cost:p.r.energy_cost, protein_cost:p.r.protein_cost}));
      c.addEventListener('mouseleave', hideTooltip);
      fsvg.appendChild(c);
    });
  }

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
        <h3 style="color:${'var(--c-'+f+')'}"><b>${FORMAT_LABEL[f]}</b></h3>
        <div class="tell-block"><div class="tell-label good">Generous, before you order</div><div class="tell-text">${TELLS[f].gen}</div></div>
        <div class="tell-block"><div class="tell-label bad">Stingy, before you order</div><div class="tell-text">${TELLS[f].sting}</div></div>
      </div>`).join('') + `
      <div class="tier-col">
        <h3 style="color:var(--c-grocery_ready)"><b>Grocery — home-cooked vs ready-to-eat</b></h3>
        <div class="tell-block"><div class="tell-label good">The one universal tell</div><div class="tell-text">Cooking your own protein runs 3–10x cheaper per protein unit than any restaurant format in this dataset. Among ready-to-eat options, a whole rotisserie chicken (sold by weight, minimal per-unit labour) beats individually-portioned items like sushi or a sandwich — same "whole item vs small portion" pattern that shows up in restaurant formats too.</div></div>
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
        <div class="t-fmt">${FORMAT_LABEL[r.format]}</div>
        <div class="t-dish">${r.dish_name}</div>
        <div class="t-meta">${r.venue} · $${r.price.toFixed(2)} · $${r.energy_cost.toFixed(2)}/1000kcal · $${r.protein_cost.toFixed(2)}/protein unit</div>
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
    {key:'energy',  emoji:'🔥', label:'Cheap calories',     help:'Wins: the lowest $ per 1000 kcal.',                       get:r=>-r.energy_cost},
    {key:'protein', emoji:'🥩', label:'Cheap protein',      help:'Wins: the lowest $ per 20g protein unit.',                get:r=>-r.protein_cost},
    {key:'veg',     emoji:'🥦', label:'Vegetables on it',   help:'Wins: the most grams of veg. Most dishes score 0 here.',  get:r=>r.veg_g||0},
    {key:'fill',    emoji:'💪', label:'Actually a meal',    help:'Wins: the most protein in one order, cheap or not.',      get:r=>r.protein_g},
    {key:'near',    emoji:'📍', label:'Close by',           help:'Wins: the shortest walk from 120 Carlton.',               get:r=>-r.distance_m},
    {key:'spend',   emoji:'💵', label:'Low total spend',    help:'Wins: the smallest number on the bill, whatever it buys.',get:r=>-r.price}
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

  // ---- weight sliders ----
  const weightsWrap = document.getElementById('weights');
  const weightsPreview = document.getElementById('weights-preview');
  function buildWeights(){
    if(!weightsWrap) return;
    weightsWrap.innerHTML = DIMS.map(d=>`
      <div class="wctl">
        <div class="lbl"><span>${d.emoji} ${d.label}</span><span class="val" id="wv-${d.key}">${state.weights[d.key]}</span></div>
        <input type="range" id="w-${d.key}" min="0" max="10" step="1" value="${state.weights[d.key]}">
        <div class="whelp">${d.help}</div>
      </div>`).join('');
    DIMS.forEach(d=>{
      document.getElementById('w-'+d.key).addEventListener('input', ev=>{
        state.weights[d.key] = +ev.target.value;
        document.getElementById('wv-'+d.key).textContent = state.weights[d.key];
        syncPreview(); renderTable(); renderVenues(); renderPickBadges();
      });
    });
    syncPreview();
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
        <h3>${i===0?'🥇 ':''}${FORMAT_LABEL[r.format]} <b style="font-size:12px">≤ ${ceiling}</b></h3>
        <div class="tier-row">
          <div class="t-dish">${r.dish_name}</div>
          <div class="t-meta">${r.venue} · $${r.price.toFixed(2)} · ${r.protein_g}g protein · $${r.protein_cost.toFixed(2)}/unit · ${r.distance_m}m</div>
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
    tbl.querySelector('thead').innerHTML = '<tr><th style="width:30px">#</th><th>Venue</th><th>Its best dish for you</th><th>Distance</th><th>Price</th><th>$/protein unit</th><th>Your score</th></tr>';
    tbl.querySelector('tbody').innerHTML = list.length ? list.map((r,i)=>`
      <tr>
        <td class="num">${i<5?`<span class="pickno">${i+1}</span>`:i+1}</td>
        <td class="dish-cell"><b>${r.venue}</b><span class="venue">${r.cuisine}</span></td>
        <td class="dish-cell"><b style="font-weight:500">${r.dish_name}</b><span class="venue">${FORMAT_LABEL[r.format]} · ${r.protein_g}g protein</span></td>
        <td class="num">${r.distance_m}m</td>
        <td class="num">$${r.price.toFixed(2)}</td>
        <td class="num">$${r.protein_cost.toFixed(2)}</td>
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
  let proInit = false;
  try{ proInit = localStorage.getItem('carlton.pro')==='on'; }catch(e){}
  applyPro(proInit, true);

  function renderAll(){
    renderChart(); renderTable(); renderSpread(); renderMatrix(); renderFancy(); renderTells();
    renderPickBadges();   // no-ops and clears itself when pro is off
    if(state.pro){ renderBudget(); renderVenues(); }
    else { renderTiers(); renderPicks(); }
  }
  let resizeTimer;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{ buildChartOnce(); renderChart(); renderPickBadges(); renderFancy(); }, 150);
  });
  renderAll();
})();
