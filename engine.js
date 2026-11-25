const rad=Math.PI/180;
function meters(a,b){
 const dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2)));
}
function offset(p,m,angle){return [p[0]+m*Math.cos(angle)/111195,p[1]+m*Math.sin(angle)/(111195*Math.cos(p[0]*rad))]}
function lengthOf(points){return points.slice(1).reduce((n,p,i)=>n+meters(points[i],p),0)}
function shorten(points,target){
 let left=target,out=[points[0]];
 for(const p of points.slice(1)){const last=out[out.length-1],d=meters(last,p);
 if(d>left){out.push(last.map((v,i)=>v+(p[i]-v)*left/d));break}out.push(p);left-=d}
 return out;
}
function cells(points){
 const s=new Set();for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(meters(a,b)/30));
 for(let j=0;j<steps;j++){const p=a.map((v,k)=>v+(b[k]-v)*j/steps);s.add(p.map(v=>Math.round(v*2500)).join(','))}}return s;
}
async function json(url,ms=12000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw Error(String(r.status));return await r.json()}finally{clearTimeout(t)}}
function mappedRunningLine(relation){
 if(relation.tags?.route!=='running'||!relation.members)return null;
 const ways=relation.members.filter(member=>member.type!=='node');
 if(!ways.length||ways.some(m=>m.type!=='way'||!['','forward','backward'].includes(m.role)||!m.geometry||m.geometry.length<2))return null;
 const segments=ways.map(m=>m.geometry.map(p=>[p?.lat,p?.lon]));
 if(segments.some(s=>s.some(p=>!p.every(Number.isFinite))))return null;
 const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
 function assemble(reverseFirst){
  let line=[];
  for(let i=0;i<ways.length;i++){
   const s=segments[i],role=ways[i].role,last=line[line.length-1];
   const reverse=role==='backward'||(!role&&(i===0?reverseFirst:same(last,s[s.length-1])));
   const ordered=reverse?s.slice().reverse():s;
   if(i&&!same(last,ordered[0]))return null;
   for(let j=i?1:0;j<ordered.length;j++)line.push(ordered[j]);
  }
  return line;
 }
 return assemble(false)||assemble(true);
}
function nearbyCourses(start,target,entries,crossings,relaxed=false){
 const matches=[];
 for(const entry of entries){
  if(!entry.line?.length)continue;
  const fromStart=meters(start,entry.line[0]);
  if(fromStart>10000)continue;
  const distance=lengthOf(entry.line);
  if(!relaxed&&Math.abs(distance-target)>target*.35)continue;
  if(matches.some(m=>m.name===entry.name&&meters(m.points[0],entry.line[0])<250))continue;
  matches.push({...entry,points:entry.line,fromStart,distance,crossings:crossingVisits(entry.line,crossings)});
 }
 return matches.sort((a,b)=>(relaxed?Math.abs(a.distance-target)-Math.abs(b.distance-target):0)||(a.crossings??Infinity)-(b.crossings??Infinity)||Math.abs(a.distance-target)-Math.abs(b.distance-target)||a.fromStart-b.fromStart).slice(0,3);
}
async function courses(p,target){
 const around='(around:'+Math.round(Math.min(7000,target/2+350))+','+p.join(',')+')';
 const query='[out:json][timeout:9];(relation["route"="running"]'+around+';nwr["sport"~"athletics|running"]["leisure"="track"]["access"!~"private|no"]'+around+';);out geom 60;';
 const data=await json('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),12500);
 return data.elements.map(e=>{const raw=e.geometry||e.members?.flatMap(m=>m.geometry||[])||(e.lat!=null?[e]:[]);
 const points=raw.filter(Boolean).map(v=>[v.lat,v.lon]).filter(v=>v.every(Number.isFinite));
 const closest=points.reduce((a,b)=>!a||meters(p,b)<meters(p,a)?b:a,null);
 return {closest,points,line:mappedRunningLine(e),kind:'Community-mapped running course',credit:'OpenStreetMap contributors',name:e.tags?.name||(e.type==='relation'?'Mapped running course':'Athletics track'),url:'https://www.openstreetmap.org/'+e.type+'/'+e.id}
 }).filter(e=>e.closest).sort((a,b)=>meters(p,a.closest)-meters(p,b.closest));
}
function decode(s){let i=0,lat=0,lon=0,out=[];function part(){let n=0,shift=0,b;do{b=s.charCodeAt(i++)-63;n|=(b&31)<<shift;shift+=5}while(b>=32);return n&1?~(n>>1):n>>1}
 while(i<s.length){lat+=part();lon+=part();out.push([lat/1e6,lon/1e6])}return out}
async function mappedCrossings(start,target){
 const radius=Math.min(7000,Math.ceil(target/2+350));
 const query='[out:json][timeout:10];node["highway"="crossing"](around:'+radius+','+start.join(',')+');out body;';
 const data=await json('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),13000);
 if(data.remark||!Array.isArray(data.elements))throw Error('Incomplete crossing data');
 const rows=new Map();
 for(const node of data.elements){
  const row=Math.floor(node.lat*1000);
  if(!rows.has(row))rows.set(row,[]);
  rows.get(row).push(node);
 }
 return {start,radius,rows};
}
function crossingVisits(points,index){
 if(!index||points.some(p=>meters(p,index.start)>index.radius-10))return null;
 const lastVisit=new Map();let travelled=0,count=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  const east=111195*Math.cos(a[0]*rad),dx=(b[1]-a[1])*east,dy=(b[0]-a[0])*111195;
  if(dx===0&&dy===0)continue;
  const first=Math.floor((Math.min(a[0],b[0])-.00008)*1000);
  const last=Math.floor((Math.max(a[0],b[0])+.00008)*1000);
  for(let row=first;row<=last;row++)for(const n of index.rows.get(row)||[]){
   const x=(n.lon-a[1])*east,y=(n.lat-a[0])*111195;
   const t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy)));
   if(Math.hypot(x-t*dx,y-t*dy)>8)continue;
   const position=travelled+t*Math.hypot(dx,dy);
   if(position-(lastVisit.get(n.id)??-Infinity)>18)count++;
   lastVisit.set(n.id,position);
  }
  travelled+=Math.hypot(dx,dy);
 }
 return count;
}
async function walk(points){
 const q={locations:points.map(([lat,lon])=>({lat,lon,radius:80})),costing:'pedestrian',units:'kilometers',costing_options:{pedestrian:{walkway_factor:0.4,sidewalk_factor:0.9}},language:'en-US'};
 const r=await json('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(q)));
 const legs=r.trip?.legs;if(!legs?.length)throw Error('No path');
 const lines=legs.map(l=>decode(l.shape));if(lines.some(a=>a.length<2)||meters(points[0],lines[0][0])>100)return null;
 const names=legs.flatMap(l=>l.maneuvers||[]).flatMap(m=>m.street_names||[]);
 return {lines,name:names.find(n=>/trail|path|park|greenway|promenade/i.test(n))||names[0]};
}
function closeCourse(points,items){
 const line=points.filter((_,i)=>i%Math.max(1,Math.round(points.length/150))===0);
 return items.find(e=>e.points.some((p,i)=>i%Math.max(1,Math.round(e.points.length/300))===0&&line.some(q=>meters(q,p)<75)));
}
async function candidate(start,target,shape,angle,scale,items){
 const loop=shape==='loop',r=target*(loop?.22:.53)*scale;
 const via=offset(start,r,angle),waypoints=loop?[start,via,offset(start,r,angle+Math.PI/3),start]:[start,via];
 const trip=await walk(waypoints);if(!trip)return null;
 let points=trip.lines.flat();if(loop){
 const edges=new Set();let repeated=0;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],key=[a.join(','),b.join(',')].sort().join('|');if(edges.has(key))repeated+=meters(a,b);edges.add(key)}
 if(repeated>lengthOf(points)*.27)return null;
 }else{const half=shorten(points,target/2);points=half.concat(half.slice(0,-1).reverse())}
 const distance=lengthOf(points);if(distance<100)return null;
 return {points,distance,name:trip.name,evidence:closeCourse(points,items),cells:cells(points)};
}
