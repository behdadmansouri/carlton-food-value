(function(){
  const D = window.CARLTON_DATA;
  const FORMATS = ["protein_on_starch","wrap_sandwich","soup_bowl","composed_small_plates","whole_item_family","grocery"];
  const FORMAT_LABEL = {
    protein_on_starch:"Protein on starch", wrap_sandwich:"Wrap / sandwich", soup_bowl:"Soup bowl",
    composed_small_plates:"Composed small plates", whole_item_family:"Whole item / family", grocery:"Grocery (home-cooked)"
  };
  const CONF = ["high","medium","low"];

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

  // ---- state ----
  const state = { maxDist: 1000, confs: new Set(CONF), formats: new Set(FORMATS), sortKey:"protein_cost", sortDir:1 };

  // ================= MAP =================
  const map = L.map('map', {scrollWheelZoom:false}).setView([D.center.lat, D.center.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  L.circle([D.center.lat, D.center.lng], {radius:1000, color:'#5f696d', weight:1, dashArray:'4 4', fill:false}).addTo(map);
  L.marker([D.center.lat, D.center.lng], {icon: L.divIcon({className:'', html:'<div style="width:14px;height:14px;border-radius:50%;background:#e8ecee;border:2px solid #0f1214"></div>', iconSize:[14,14]})})
    .addTo(map).bindPopup('<b>120 Carlton St</b><br>Center point');

  const markers = [];
  function colorFor(fmt){ return getComputedStyle(document.documentElement).getPropertyValue('--c-'+fmt).trim(); }

  function addVenueMarkers(){
    D.venues.forEach(v=>{
      const best = v.dishes.reduce((a,b)=> (a.protein_cost < b.protein_cost ? a : b));
      const m = L.circleMarker([v.lat, v.lng], {
        radius:7, color:colorFor(best.format), weight:2, fillColor:colorFor(best.format), fillOpacity:.55
      }).addTo(map);
      const dishList = v.dishes.map(d=>`${d.dish_name} — $${d.price.toFixed(2)} <span class="tag">${d.confidence}</span>`).join('<br>');
      m.bindPopup(`<b>${v.name}</b><br><span style="color:#98a3a8">${v.cuisine} · ${v.distance_m}m</span><br><br>${dishList}`);
      m._venue = v;
      markers.push(m);
    });
    const g = L.circleMarker([D.grocery_store.lat, D.grocery_store.lng], {
      radius:8, color:colorFor('grocery'), weight:2, fillColor:colorFor('grocery'), fillOpacity:.7
    }).addTo(map).bindPopup(`<b>${D.grocery_store.name}</b><br>Grocery baseline · ${D.grocery_store.distance_m}m`);
  }
  addVenueMarkers();

  // ================= CHART =================
  const svg = document.getElementById('chart');
  const tooltip = document.getElementById('tooltip');
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); return e; }

  function renderChart(){
    svg.innerHTML='';
    const W = svg.clientWidth || 600, H = 420;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const pad = {l:52,r:18,t:16,b:38};
    const visible = filteredRows();
    if(visible.length===0){ return; }
    const maxX = Math.max(...visible.map(r=>r.energy_cost)) * 1.08;
    const maxY = Math.max(...visible.map(r=>r.protein_cost)) * 1.12;
    const x = v => pad.l + (v/maxX) * (W-pad.l-pad.r);
    const y = v => H-pad.b - (v/maxY) * (H-pad.t-pad.b);

    // grid + axes
    const xTicks = 5, yTicks = 5;
    for(let i=0;i<=xTicks;i++){
      const v = maxX*i/xTicks;
      const gx = x(v);
      svg.appendChild(el('line',{x1:gx,x2:gx,y1:pad.t,y2:H-pad.b,class:'grid-line'}));
      const t = el('text',{x:gx,y:H-pad.b+16,class:'axis-label','text-anchor':'middle'}); t.textContent='$'+v.toFixed(0); svg.appendChild(t);
    }
    for(let i=0;i<=yTicks;i++){
      const v = maxY*i/yTicks;
      const gy = y(v);
      svg.appendChild(el('line',{x1:pad.l,x2:W-pad.r,y1:gy,y2:gy,class:'grid-line'}));
      const t = el('text',{x:pad.l-8,y:gy+3,class:'axis-label','text-anchor':'end'}); t.textContent='$'+v.toFixed(0); svg.appendChild(t);
    }
    const xl = el('text',{x:(W+pad.l-pad.r)/2,y:H-4,class:'axis-label','text-anchor':'middle'}); xl.textContent='$ per 1000 kcal'; svg.appendChild(xl);
    const yl = el('text',{x:12,y:(H)/2,class:'axis-label','text-anchor':'middle',transform:`rotate(-90 12 ${H/2})`}); yl.textContent='$ per 20g protein'; svg.appendChild(yl);

    // pareto frontier among visible, non-grocery points isn't required; compute across all visible
    const pts = visible.map(r=>({r, x:r.energy_cost, y:r.protein_cost}));
    const sorted = pts.slice().sort((a,b)=>a.x-b.x);
    const frontier = [];
    let minY = Infinity;
    sorted.forEach(p=>{ if(p.y < minY){ frontier.push(p); minY = p.y; } });
    if(frontier.length>1){
      const path = frontier.map((p,i)=> (i===0?'M':'L') + x(p.x).toFixed(1) + ',' + y(p.y).toFixed(1)).join(' ');
      svg.appendChild(el('path',{d:path, class:'frontier-line'}));
    }

    pts.forEach(p=>{
      const r = p.r;
      const onFrontier = frontier.includes(p);
      const radius = 4 + Math.min(6, Math.sqrt(r.kcal)/14);
      const c = el('circle',{
        cx:x(p.x), cy:y(p.y), r: radius.toFixed(1),
        fill: colorFor(r.format), 'fill-opacity': onFrontier ? 0.95 : (r.format==='grocery'?0.9:0.55),
        class: 'dot' + (r.confidence==='low' ? ' low-conf':'')
      });
      c.addEventListener('mousemove', (ev)=> showTooltip(ev, r));
      c.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(c);
    });
  }

  function showTooltip(ev, r){
    tooltip.style.opacity = 1;
    const rect = svg.getBoundingClientRect();
    tooltip.style.left = (ev.clientX - rect.left + 14) + 'px';
    tooltip.style.top = (ev.clientY - rect.top + 10) + 'px';
    tooltip.innerHTML = `<b>${r.dish_name}</b>
      <div class="tt-meta">${r.venue} · ${r.cuisine} · ${r.distance_m}m</div>
      <div class="tt-metrics">
        <div><span>Price</span>$${r.price.toFixed(2)}</div>
        <div><span>kcal</span>${r.kcal}</div>
        <div><span>Protein</span>${r.protein_g}g</div>
      </div>
      <div class="tt-metrics">
        <div><span>$/1000kcal</span>$${r.energy_cost.toFixed(2)}</div>
        <div><span>$/protein unit</span>$${r.protein_cost.toFixed(2)}</div>
      </div>
      <div class="tt-meta" style="margin-top:6px">confidence: ${r.confidence}${r.multi_meal?' · multi-meal':''}</div>`;
  }
  function hideTooltip(){ tooltip.style.opacity = 0; }

  // ================= FILTERS =================
  function filteredRows(){
    return rows.filter(r => r.distance_m <= state.maxDist && state.confs.has(r.confidence) && state.formats.has(r.format));
  }

  const distSlider = document.getElementById('dist-slider');
  const distVal = document.getElementById('dist-val');
  distSlider.addEventListener('input', ()=>{
    state.maxDist = +distSlider.value;
    distVal.textContent = state.maxDist + 'm';
    renderAll();
  });

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
    const visible = filteredRows().slice().sort((a,b)=>{
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

  function renderAll(){ renderChart(); renderTable(); }
  window.addEventListener('resize', renderChart);
  renderAll();
})();
