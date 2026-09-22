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
  const state = { maxDist: 1000, confs: new Set(CONF), formats: new Set(FORMATS), sortKey:"protein_cost", sortDir:1, channel:"dine_in" };

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
  let chartBuilt = false;
  let axisMax = {x:1, y:1};

  function filteredRows(){
    return rows.filter(r => {
      if(r.distance_m > state.maxDist) return false;
      if(!state.confs.has(r.confidence)) return false;
      if(!state.formats.has(r.format)) return false;
      if(state.channel==='grocery' && RESTAURANT_FORMATS.has(r.format)) return false;
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

  function buildChartSkeleton(visible){
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
    visible.forEach((r)=>{
      const key = r.venue+'|'+r.dish_name;
      const c = el('circle',{cx:-100,cy:-100,r:5, fill:colorFor(r.format), class:'dot'+(r.confidence==='low'?' low-conf':'')});
      svg.appendChild(c);
      svg._dots[key] = c;
    });
    chartBuilt = true;
  }

  function renderChart(){
    const visible = filteredRows();
    if(visible.length===0){ svg.innerHTML=''; chartBuilt=false; return; }
    const eff = visible.map(r=>Object.assign({r}, effective(r)));
    axisMax.x = Math.max(...eff.map(e=>e.energy_cost)) * 1.08;
    axisMax.y = Math.max(...eff.map(e=>e.protein_cost)) * 1.12;

    buildChartSkeleton(visible); // rebuild skeleton (axes rescale) but dots start off-canvas then animate in

    const {x,y} = chartGeom();
    const sorted = eff.slice().sort((a,b)=>a.energy_cost-b.energy_cost);
    const frontier = [];
    let minY = Infinity;
    sorted.forEach(p=>{ if(p.protein_cost < minY){ frontier.push(p); minY = p.protein_cost; } });
    if(frontier.length>1){
      const path = frontier.map((p,i)=> (i===0?'M':'L') + x(p.energy_cost).toFixed(1) + ',' + y(p.protein_cost).toFixed(1)).join(' ');
      requestAnimationFrame(()=> svg._frontierPath.setAttribute('d', path));
    }

    requestAnimationFrame(()=>{
      eff.forEach(e=>{
        const key = e.r.venue+'|'+e.r.dish_name;
        const c = svg._dots[key];
        if(!c) return;
        const onFrontier = frontier.includes(e);
        const radius = 4 + Math.min(6, Math.sqrt(e.r.kcal)/14);
        c.setAttribute('cx', x(e.energy_cost).toFixed(1));
        c.setAttribute('cy', y(e.protein_cost).toFixed(1));
        c.setAttribute('r', radius.toFixed(1));
        c.setAttribute('fill-opacity', onFrontier ? 0.95 : (e.r.format.startsWith('grocery') ? 0.9 : 0.55));
        c._data = e;
      });
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
      if(state.sortKey===key) state.sortDir *= -1; else { state.sortKey=key; state.sortDir=1; }
      renderTable();
    });
  });

  function renderTable(){
    const visible = filteredRows().map(r=>Object.assign({}, r, effective(r)));
    visible.sort((a,b)=>{
      const k = state.sortKey;
      return (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * state.sortDir;
    });
    tbody.innerHTML = visible.map(r=>`
      <tr>
        <td class="dish-cell"><b>${r.dish_name}</b><span class="venue">${r.venue} · ${r.cuisine}</span></td>
        <td><span class="tag">${FORMAT_LABEL[r.format]}</span></td>
        <td class="num">${r.distance_m}m</td>
        <td class="num">$${r.price.toFixed(2)}</td>
        <td class="num">${r.kcal}</td>
        <td class="num">${r.protein_g}g</td>
        <td class="num">$${r.energy_cost.toFixed(2)}</td>
        <td class="num">$${r.protein_cost.toFixed(2)}</td>
        <td class="conf-${r.confidence}">${r.confidence}${r.multi_meal?' · multi-meal':''}</td>
      </tr>`).join('');
  }

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

  function renderAll(){ renderChart(); renderTable(); renderTiers(); renderSpread(); }
  window.addEventListener('resize', renderChart);
  renderAll();
})();
