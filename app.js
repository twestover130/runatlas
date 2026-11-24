const $=id=>document.getElementById(id), map=L.map('map',{worldCopyJump:true}).setView([25,0],2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
const overlay=L.layerGroup().addTo(map);
let start=null,marker=null,picking=false,run=0,locationRequest=0,options=[],unit='mi',searchShape='loop',busy=false;
function el(tag,txt){const n=document.createElement(tag);if(txt)n.textContent=txt;return n}
function link(label,url){const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
function clearResults(){run++;busy=false;$('find').disabled=false;options=[];overlay.clearLayers();$('routes').replaceChildren();$('sources').replaceChildren();$('status').textContent='Set your starting point and distance to see routes here.'}
function choose(p,label){clearResults();locationRequest++;start=p;picking=false;$('chosen').textContent=label+' · '+p.map(n=>n.toFixed(4)).join(', ');$('places').replaceChildren();$('mapstate').textContent='Start selected';map.setView(p,15);if(marker)marker.remove();marker=L.circleMarker(p,{radius:7,color:'#163a31',fillColor:'#fac47c',weight:3,fillOpacity:1}).bindTooltip('Start / finish').addTo(map)}
$('pick').onclick=()=>{picking=true;$('mapstate').textContent='Tap your starting point';$('map').scrollIntoView({behavior:'smooth',block:'center'})};
map.on('click',e=>{if(picking)choose([e.latlng.lat,e.latlng.wrap().lng],'Pinned start')});
$('gps').onclick=()=>{const id=++locationRequest;$('chosen').textContent='Locating you…';if(!navigator.geolocation){$('chosen').textContent='Location unavailable. Search or pick on map.';return}
 navigator.geolocation.getCurrentPosition(p=>{if(id===locationRequest)choose([p.coords.latitude,p.coords.longitude],'Current location')},()=>{if(id===locationRequest)$('chosen').textContent='Location unavailable. Search or pick on map.'},{enableHighAccuracy:true,timeout:15000,maximumAge:30000})};
$('lookup').onclick=async()=>{const q=$('place').value.trim();if(!q)return $('place').focus();
 const coords=q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
 if(coords&&Math.abs(+coords[1])<=85&&Math.abs(+coords[2])<=180){choose([+coords[1],+coords[2]],'Coordinate start');return}
 const id=++locationRequest;$('places').textContent='Searching…';
 try{const data=await json('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&q='+encodeURIComponent(q));if(id!==locationRequest)return;$('places').replaceChildren();
 for(const hit of data){const b=el('button',hit.display_name);b.type='button';b.onclick=()=>choose([+hit.lat,+hit.lon],hit.display_name.split(',')[0]);$('places').append(b)}
 if(!data.length)$('places').textContent='No places found. Try a city or pick on map.'}catch{if(id===locationRequest)$('places').textContent='Place search unavailable. Use GPS or pick on map.'}};
$('place').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('lookup').click()}};
function fmt(m){return (m/(unit==='mi'?1609.344:1000)).toFixed(2)+' '+unit}
function localLinks(p,items,failed){
 const block=$('sources');block.replaceChildren(el('h3','Local running sources'));
 block.append(el('p',failed?'Live map lookup unavailable. Nearby parkrun venues are listed when available.':items.length?items.length+' nearby running venues.':'No nearby running courses or tracks found in the map data.'));
 block.append(link('parkrun event directory · Nov 2026','https://www.parkrun.com/events/'));items.slice(0,4).forEach(e=>block.append(link(e.name,e.url)));
 block.append(link('Strava heatmap','https://www.strava.com/maps/global-heatmap?sport=Run#14/'+p[0]+'/'+p[1]),link('Nearby running clubs','https://www.google.com/maps/search/running+club/@'+p.join(',')+',14z'));
}
function show(i){overlay.clearLayers();const o=options[i];L.polyline(o.points,{color:'#fff',weight:9}).addTo(overlay);const line=L.polyline(o.points,{color:'#247849',weight:5}).addTo(overlay);map.fitBounds(line.getBounds(),{padding:[25,25],maxZoom:17});
 if(searchShape==='back')L.circleMarker(o.points[(o.points.length-1)/2],{radius:6,color:'#754918',fillColor:'#ffc479',fillOpacity:1}).bindTooltip('Turnaround').addTo(overlay);marker.bringToFront();Array.from($('routes').children).forEach((n,j)=>{n.classList.toggle('active',i===j);n.firstChild.setAttribute('aria-pressed',String(i===j))})}
function routeTitle(o,i){return o.name||(fmt(o.distance)+(searchShape==='back'?' out & back':' loop'))}
function xmlText(t){return String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function routeFile(points,index,title){
 const track=points.map(([lat,lon])=>'<trkpt lat="'+lat+'" lon="'+lon+'"/>').join('');
 const name=xmlText('Run Atlas · '+(title||'Route '+(index+1)));
 const gpx='<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Run Atlas" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>'+name+'</name></metadata><trk><name>'+name+'</name><trkseg>'+track+'</trkseg></trk></gpx>';
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
function render(){const root=$('routes');root.replaceChildren();options.forEach((o,i)=>{const card=el('div');card.className='card';const b=el('button',fmt(o.distance)+' · '+(o.name||'Route '+(i+1)));b.onclick=()=>{show(i);$('map').scrollIntoView({behavior:'smooth',block:'center'})};card.append(b);
 const note=el('p');note.className='evidence';if(o.evidence){note.append('Passes within 75 m of ',link(o.evidence.name,o.evidence.url))}else note.textContent='Pedestrian route · running activity unverified';card.append(note);card.append(el('p',o.crossings==null?'Mapped crossing estimate unavailable':'Nearby mapped crossing visits: '+o.crossings));
 const title=routeTitle(o,i),file=routeFile(o.points,i,title);
 if(isAndroid){const open=el('a','Open in Tripace Pro');open.className='tripace';open.href=tripaceLink(o.points,title);card.append(open)}
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
 card.append(download);
 root.append(card)});if(options.length)show(0)}
$('planner').onsubmit=async e=>{e.preventDefault();if(!start){$('chosen').textContent='Use GPS, search for a place, or tap Pick on map first.';return}
 clearResults();const id=run,p=start.slice();unit=$('unit').value;const target=+$('distance').value*(unit==='mi'?1609.344:1000);
 if(target<500||target>42200){$('status').textContent='Choose a distance from 0.5 to 42 km (0.32 to 26.2 mi).';return}
 searchShape=document.querySelector('[name=shape]:checked').value;busy=true;$('find').disabled=true;$('status').textContent='Looking for nearby running courses and tracks…';$('status').scrollIntoView({behavior:'smooth',block:'center'});
 const [mapped,events,crossings]=await Promise.allSettled([courses(p,target),json('./events.json'),mappedCrossings(p,target)]);
 const failed=mapped.status==='rejected';
 const items=mapped.status==='fulfilled'?mapped.value:[];
 if(events.status==='fulfilled')for(const [name,lat,lon,url] of events.value){
  const closest=[lat,lon];if(meters(p,closest)<Math.min(12000,target/2+1500))items.push({closest,points:[closest],name:name+' start',url});
 }
 items.sort((a,b)=>meters(p,a.closest)-meters(p,b.closest));if(id!==run)return;localLinks(p,items,failed);
 const anchor=items.find(x=>meters(p,x.closest)>100&&meters(p,x.closest)<target*.6)?.closest;
 const initial=anchor?Math.atan2((anchor[1]-p[1])*Math.cos(p[0]*rad),anchor[0]-p[0]):Math.PI/5;
 let scale=1,errors=0;
 for(let k=0;k<7;k++){if(id!==run)return;$('status').textContent='Checking pedestrian paths · '+options.length+' found';try{
 const o=await candidate(p,target,searchShape,initial+k*2.4,scale,items);if(id!==run)return;if(o){scale=Math.max(.55,Math.min(1.8,scale*target/o.distance));const near=Math.abs(o.distance-target)/target<=.22;
 if(near){o.crossings=crossingVisits(o.points,crossings.value);options.push(o)}}}catch{errors++;if(errors>=3)break}if(k<6)await new Promise(resolve=>setTimeout(resolve,1100))}
 if(id!==run)return;options.sort((a,b)=>(a.crossings??Infinity)-(b.crossings??Infinity)||Number(!!b.evidence)-Number(!!a.evidence)||Math.abs(a.distance-target)-Math.abs(b.distance-target));const best=[];for(const route of options){if(best.every(other=>{let shared=0;for(const c of route.cells)if(other.cells.has(c))shared++;return shared/Math.min(route.cells.size,other.cells.size)<.72}))best.push(route);if(best.length===3)break}options=best;render();busy=false;$('find').disabled=false;
 $('status').textContent=options.length?options.length+' option'+(options.length===1?'':'s')+' near '+fmt(target)+'. Review crossings, lighting and current access before running.':errors>=3?'Pedestrian routing service unavailable. Retry in a moment.':'No distinct routes within 22% of your distance. Try another start, distance or shape.'};
for(const n of document.querySelectorAll('#distance,#unit,[name=shape]'))n.addEventListener('input',clearResults);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
