const $=id=>document.getElementById(id), map=L.map('map',{worldCopyJump:true}).setView([25,0],2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
const overlay=L.layerGroup().addTo(map);
let start=null,marker=null,picking=false,run=0,locationRequest=0,options=[],unit='mi',searchShape='loop',busy=false;
function el(tag,txt){const n=document.createElement(tag);if(txt)n.textContent=txt;return n}
function link(label,url){const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
function clearResults(){run++;busy=false;$('find').disabled=false;options=[];overlay.clearLayers();$('routes').replaceChildren();$('sources').replaceChildren();$('status').textContent='Set your starting point and distance to see routes here.'}
function choose(p,label){clearResults();locationRequest++;start=p;picking=false;$('chosen').textContent=label;$('places').replaceChildren();$('mapstate').textContent='Start selected';map.setView(p,15);if(marker)marker.remove();marker=L.circleMarker(p,{radius:7,color:'#163a31',fillColor:'#fac47c',weight:3,fillOpacity:1}).bindTooltip('Start / finish').addTo(map)}
$('pick').onclick=()=>{picking=true;$('mapstate').textContent='Tap your starting point';$('map').scrollIntoView({behavior:'smooth',block:'center'})};
map.on('click',e=>{if(picking)choose([e.latlng.lat,e.latlng.wrap().lng],'Pinned start')});
$('gps').onclick=()=>{const id=++locationRequest;$('chosen').textContent='Locating you…';if(!navigator.geolocation){$('chosen').textContent='Location unavailable. Enter a street address or pick on map.';return}
 navigator.geolocation.getCurrentPosition(p=>{if(id===locationRequest)choose([p.coords.latitude,p.coords.longitude],'Current location')},()=>{if(id===locationRequest)$('chosen').textContent='Location unavailable. Enter a street address or pick on map.'},{enableHighAccuracy:true,timeout:15000,maximumAge:30000})};
async function lookup(afterChoose){const q=$('place').value.trim();if(!q)return $('place').focus();
 const coords=q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
 if(coords&&Math.abs(+coords[1])<=85&&Math.abs(+coords[2])<=180){choose([+coords[1],+coords[2]],'Coordinate start');afterChoose?.();return}
 const id=++locationRequest;$('places').textContent='Searching…';
 try{const data=await json('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&q='+encodeURIComponent(q));if(id!==locationRequest)return;$('places').replaceChildren();
 for(const hit of data){const b=el('button',hit.display_name);b.type='button';b.onclick=()=>{choose([+hit.lat,+hit.lon],hit.display_name);afterChoose?.()};$('places').append(b)}
 if(!data.length)$('places').textContent='No places found. Try a city or pick on map.'}catch{if(id===locationRequest)$('places').textContent='Place search unavailable. Use GPS or pick on map.'}};
$('lookup').onclick=()=>lookup();
$('place').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('lookup').click()}};
function fmt(m){return (m/(unit==='mi'?1609.344:1000)).toFixed(2)+' '+unit}
function localLinks(p,items,failed){
 const block=$('sources');block.replaceChildren(el('h3','Local running sources'));
 block.append(el('p',failed?'Live map lookup unavailable. Nearby parkrun venues are listed when available.':items.length?items.length+' nearby running venues.':'No nearby running courses or tracks found in the map data.'));
 block.append(link('parkrun event directory · Nov 2026','https://www.parkrun.com/events/'));items.slice(0,4).forEach(e=>block.append(link(e.name,e.url)));
 block.append(link('Strava heatmap','https://www.strava.com/maps/global-heatmap?sport=Run#14/'+p[0]+'/'+p[1]),link('Nearby running clubs','https://www.google.com/maps/search/running+club/@'+p.join(',')+',14z'));
}
function show(i){overlay.clearLayers();const o=options[i];L.polyline(o.points,{color:'#fff',weight:9}).addTo(overlay);const line=L.polyline(o.points,{color:'#247849',weight:5}).addTo(overlay);map.fitBounds(line.getBounds(),{padding:[25,25],maxZoom:17});
 if(o.kind)L.circleMarker(o.points[0],{radius:6,color:'#247849'}).bindTooltip('Course start').addTo(overlay);else if((o.shape||searchShape)==='back')L.circleMarker(o.points[(o.points.length-1)/2],{radius:6,color:'#754918',fillColor:'#ffc479',fillOpacity:1}).bindTooltip('Turnaround').addTo(overlay);marker.bringToFront();Array.from($('routes').children).forEach((n,j)=>{n.classList.toggle('active',i===j);n.firstChild.setAttribute('aria-pressed',String(i===j))})}
function routeTitle(o,i){return o.name||(fmt(o.distance)+((o.shape||searchShape)==='back'?' out & back':' loop'))}
function xmlText(t){return String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function routeFile(points,index,title,credit=''){
 const track=points.map(([lat,lon])=>'<trkpt lat="'+lat+'" lon="'+lon+'"/>').join('');
 const name=xmlText('Run Atlas · '+(title||'Route '+(index+1)));
 const gpx='<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Run Atlas" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>'+name+'</name>'+ (credit?'<desc>'+xmlText(credit)+'</desc>':'')+'</metadata><trk><name>'+name+'</name><trkseg>'+track+'</trkseg></trk></gpx>';
 return new File([gpx],'run-atlas-'+(index+1)+'.gpx',{type:'application/gpx+xml'});
}
// Google encoded polyline (5 decimals), dropping points under 3 m apart, so the whole route fits in a link
function encodePoly(points){let out='',pa=0,po=0,last=null;const put=v=>{v=v<0?~(v<<1):v<<1;while(v>=32){out+=String.fromCharCode((32|(v&31))+63);v>>=5}out+=String.fromCharCode(v+63)};
 points.forEach(([lat,lon],k)=>{if(last&&k<points.length-1&&Math.hypot((lat-last[0])*111195,(lon-last[1])*111195*Math.cos(lat*Math.PI/180))<3)return;last=[lat,lon];const a=Math.round(lat*1e5),o=Math.round(lon*1e5);put(a-pa);put(o-po);pa=a;po=o});return out}
// Opens the route in Tripace Pro for turn-by-turn voice directions; without Tripace Pro (or an older one) Chrome opens its Play page instead
function tripaceLink(points,title){
 return 'intent://route?n='+encodeURIComponent('Run Atlas · '+title)+'&p='+encodeURIComponent(encodePoly(points))
  +'#Intent;scheme=tripace;package=app.tripace;S.browser_fallback_url='+encodeURIComponent('https://play.google.com/store/apps/details?id=app.tripace')+';end';
}
const isAndroid=/Android/i.test(navigator.userAgent);
const conventionCourses=conventionRoutes.map(route=>{
 const outward=route.line||decode(route.shape);
 const line=outward.concat(outward.slice(0,-1).reverse());
 return {city:route.city,venue:route.venue,line,name:route.dest+' out & back',kind:'Planned from '+route.venue,credit:'Local running guide',url:route.source};
});
const citySelect=$('convention-city');
for(const city of [...new Set(conventionCourses.map(course=>course.city))].sort()){
 citySelect.add(new Option(city,city));
}
citySelect.onchange=()=>{
 const city=citySelect.value;
 const routes=conventionCourses.filter(course=>course.city===city);
 if(!routes.length)return;
 const first=routes[0];
 choose(first.line[0],first.venue);
 unit=$('unit').value;
 options=routes.map(course=>({...course,fromStart:meters(first.line[0],course.line[0]),points:course.line,distance:lengthOf(course.line)}));
 render();
 $('status').textContent=city+' · planned pedestrian routes. Check current crossings and access.';
 $('routes').scrollIntoView({behavior:'smooth',block:'nearest'});
 citySelect.value='';
};
function parseRunRequest(text){
 const distance=text.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(kilomet(?:er|re)s?|km|k|miles?|mi)\b/i);
 const place=text.match(/\b(?:starting (?:at|from)|from|near)\s+(.+)$/i);
 if(!distance)return null;
 const unit=/^(k)/i.test(distance[2])?'km':'mi';
 const value=Number(distance[1]);
 const meters=value*(unit==='mi'?1609.344:1000);
 if(meters<500||meters>42200)return null;
 return {value,unit,shape:/out[\s-]*(?:and|&)[\s-]*back/i.test(text)?'back':'loop',place:place?.[1].trim()};
}
$('request-run').onsubmit=async event=>{
 event.preventDefault();
 const request=parseRunRequest($('run-request').value);
 const status=$('request-status');
 if(!request){status.textContent='Enter a distance between 0.5 and 42.2 km (or the equivalent in miles).';return}
 clearResults();
 $('distance').value=request.value;
 $('unit').value=request.unit;
 document.querySelector('[name=shape][value='+request.shape+']').checked=true;
 const search=()=>{status.textContent='';$('planner').requestSubmit()};
 if(request.place){
  $('place').value=request.place;
  status.textContent='Choose the matching starting address below to begin your search.';
  await lookup(search);
 }else if(start){search()}else{status.textContent='Select a starting point below, then tap Find running routes.'}
};
const savedKey='runatlas.saved.routes.v1';
function readSaved(){return JSON.parse(localStorage.getItem(savedKey)||'[]')}
function listSaved(){
 const list=$('saved-list');list.replaceChildren();
 try{
  const records=readSaved();
  if(!records.length)list.append(el('p','Routes you save on this device appear here.'));
  for(const item of records){
   const row=el('p'),open=el('button',item.route.name+' · '+(item.route.distance/1000).toFixed(1)+' km'),remove=el('button','Remove');
   open.onclick=()=>{
    choose(item.start,item.label);unit=item.unit;searchShape=item.shape;
    options=[item.route];render();$('status').textContent='Saved route';$('map').scrollIntoView({block:'center'});
   };
   remove.onclick=()=>{
    try{localStorage.setItem(savedKey,JSON.stringify(readSaved().filter(r=>r.id!==item.id)));listSaved();if(options.length)render()}
    catch{list.append(el('p','Could not update saved routes on this device.'))}
   };
   row.append(open,remove);list.append(row);
  }
 }catch{list.append(el('p','Saved routes are unavailable in this browser.'))}
}
function saveButton(o,title){
 const button=el('button','Save route');
 button.onclick=async()=>{
  const label=$('chosen').textContent,origin=start.slice(),shape=searchShape,displayUnit=unit;
  try{
   const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(o.points)));
   const id=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
   const records=readSaved();
   if(!records.some(r=>r.id===id)){
    const route={points:o.points,distance:o.distance,shape:o.shape,name:o.name||title+' · '+label,kind:o.kind,credit:o.credit,url:o.url,fromStart:o.fromStart,crossings:o.crossings,evidence:o.evidence?{name:o.evidence.name,url:o.evidence.url}:null};
    records.unshift({id,route,start:origin,label,shape,unit:displayUnit});
    localStorage.setItem(savedKey,JSON.stringify(records));
   }
   button.textContent='Saved on this device';listSaved();
  }catch{button.textContent='Could not save · download GPX instead'}
 };
 return button;
}
listSaved();
function render(){const root=$('routes');root.replaceChildren();options.forEach((o,i)=>{const card=el('div');card.className='card';const b=el('button',fmt(o.distance)+' · '+(o.name||'Route '+(i+1)));b.onclick=()=>{show(i);$('map').scrollIntoView({behavior:'smooth',block:'center'})};card.append(b);
 const note=el('p');note.className='evidence';if(o.kind){note.append(o.kind+' · starts '+fmt(o.fromStart)+' away · ',link(o.credit,o.url));}else if(o.evidence){note.append('Passes within 75 m of ',link(o.evidence.name,o.evidence.url))}else note.textContent='Pedestrian route · running activity unverified';card.append(note);card.append(el('p',o.crossings==null?'Mapped crossing estimate unavailable':'Nearby mapped crossing visits: '+o.crossings));
 const title=routeTitle(o,i),file=routeFile(o.points,i,title,o.credit);
 if(isAndroid && tripaceLink(o.points,title).length<12000){const open=el('a','Open in Tripace Pro');open.className='tripace';open.href=tripaceLink(o.points,title);card.append(open)}
 const download=el('a','Download GPX');
 download.href='#';
 download.onclick=event=>{
  event.preventDefault();
  const url=URL.createObjectURL(file);
  const link=el('a');
  link.href=url;
  link.download=file.name;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 };
 if(navigator.share){
  const share=el('button','Share GPX');
  share.type='button';
  share.onclick=async()=>{
   const payload={files:[file]};
   const fallback='Use Download GPX, then open the file in Tripace Pro.';
   try{
    if(navigator.canShare && !navigator.canShare(payload)){ $('status').textContent=fallback; return; }
    await navigator.share(payload);
   }catch(error){if(error.name!=='AbortError')$('status').textContent=fallback}
  };
  card.append(share);
 }
 card.append(download,saveButton(o,title));
 root.append(card)});if(options.length)show(0)}
$('planner').onsubmit=async e=>{e.preventDefault();if(!start){$('chosen').textContent='Use GPS, search for a place, or tap Pick on map first.';return}
 clearResults();const id=run,p=start.slice();unit=$('unit').value;const target=+$('distance').value*(unit==='mi'?1609.344:1000);
 if(target<500||target>42200){$('status').textContent='Choose a distance from 0.5 to 42 km (0.32 to 26.2 mi).';return}
 searchShape=document.querySelector('[name=shape]:checked').value;busy=true;$('find').disabled=true;$('status').textContent='Looking for nearby running courses and tracks…';$('status').scrollIntoView({behavior:'smooth',block:'center'});
 const races=p[0]>24&&p[0]<47&&p[1]>122&&p[1]<147?json('./race-courses.json'):[];
 const [mapped,events,crossings,catalog,parkruns]=await Promise.allSettled([courses(p,target),json('./events.json'),mappedCrossings(p,target),races,target>=3500&&target<=8100?json('./parkrun-courses.json'):null]);
 const failed=mapped.status==='rejected';
 const items=mapped.status==='fulfilled'?mapped.value:[];
 if(events.status==='fulfilled')for(const [name,lat,lon,url] of events.value){
  const closest=[lat,lon];if(meters(p,closest)<Math.min(12000,target/2+1500))items.push({closest,points:[closest],name:name+' start',url});
 }
 items.sort((a,b)=>meters(p,a.closest)-meters(p,b.closest));if(id!==run)return;localLinks(p,items,failed);
 const anchor=items.find(x=>meters(p,x.closest)>100&&meters(p,x.closest)<target*.6)?.closest;
 const initial=anchor?Math.atan2((anchor[1]-p[1])*Math.cos(p[0]*rad),anchor[0]-p[0]):Math.PI/5;
 const recorded=(catalog.value||[]).map(r=>({name:r.name,line:r.points,url:r.source,credit:'kekomat · CC0 GPX',kind:'Recorded race track'}));
 const entries=(parkruns.value?.routes||[]).map(r=>({...r,line:r.points,credit:'© OpenStreetMap contributors · ODbL'})).concat(items,recorded,searchShape==='back'?conventionCourses:[]);
 const community=nearbyCourses(p,target,entries,crossings.value);
 if(community.length){options=community;render();$('status').textContent='Showing nearby courses.'}
 const generated=[];
 let scale=1,errors=0;
 for(let k=0;k<7;k++){if(id!==run)return;$('status').textContent='Checking route '+(k+1)+' of 7 · '+(community.length+generated.length)+' candidates found';try{
 const o=await candidate(p,target,searchShape,initial+k*2.4,scale,items);if(id!==run)return;if(o){scale=Math.max(.55,Math.min(1.8,scale*target/o.distance));
 o.crossings=crossingVisits(o.points,crossings.value);generated.push(o)}}catch{errors++;if(errors>=3)break}if(k<6)await new Promise(resolve=>setTimeout(resolve,1100))}
 if(id!==run)return;
 const near=route=>Math.abs(route.distance-target)<=target*.22;
 if(searchShape==='loop'&&!community.length&&!generated.some(near)){
  for(const turn of [0,2.4,4.8]){
   $('status').textContent='Looking for a shorter return path or an out-and-back alternative…';
   try{
    const route=await candidate(p,target,'back',initial+turn,1,items);
    if(id!==run)return;
    if(route){
     route.shape='back';
     route.name=(route.name||'Pedestrian route')+' · out & back';
     route.crossings=crossingVisits(route.points,crossings.value);
     generated.push(route);
     if(near(route))break;
    }
   }catch{if(id!==run)return;errors++}
  }
 }
 if(!community.length&&!generated.length){
  community.push(...nearbyCourses(p,target,entries,crossings.value,true));
 }
 const deviation=route=>Math.abs(route.distance-target)/target;
 generated.sort((a,b)=>Number(near(b))-Number(near(a))||
  (!near(a)?deviation(a)-deviation(b):0)||
  (a.crossings??Infinity)-(b.crossings??Infinity)||
  Number(!!b.evidence)-Number(!!a.evidence)||deviation(a)-deviation(b));
 const best=[];for(const route of generated){if(best.every(other=>{let shared=0;for(const c of route.cells)if(other.cells.has(c))shared++;return shared/Math.min(route.cells.size,other.cells.size)<.72}))best.push(route);if(best.length===3)break}options=community.concat(best);render();busy=false;$('find').disabled=false;
 $('status').textContent=options.length?options.length+' option'+(options.length===1?'':'s')+' for your '+fmt(target)+' request. '+(options.some(near)?'':'Closest available distance: '+fmt(options.reduce((a,b)=>deviation(a)<deviation(b)?a:b).distance)+'. ')+(best.some(o=>o.shape==='back')?'Out-and-back alternatives are labeled. ':'')+'Check current access and crossings.':errors>=3?'Pedestrian routing service unavailable. Retry in a moment.':'No walkable path found from this start. Try a nearby trail entrance or street.'};
for(const n of document.querySelectorAll('#distance,#unit,[name=shape]'))n.addEventListener('input',clearResults);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
