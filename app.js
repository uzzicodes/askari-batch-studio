'use strict';
const $=id=>document.getElementById(id),W=1627,H=2000,canvas=$('canvas'),ctx=canvas.getContext('2d');
let productRules=[],catalog=[],design=null,art=null,frame=null,products=[],selected=-1,rows=[],searching=false,stopSearch=false,exporting=false,loadVersion=0,customLogo=null,customFooter=null,noDate=false;
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const say=(s,error=false)=>{$('status').textContent=s;$('status').classList.toggle('error',error);};
const guard=fn=>async(...args)=>{try{await fn(...args)}catch(e){say(e.message||String(e),true)}};
const amount=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const s=String(v).replace(/(?:rs\.?|pkr)\s*/ig,'').replace(/[,\s%]/g,'');return /^\d+(?:\.\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):null};
const money=v=>'Rs '+Number(v).toLocaleString('en-PK',{maximumFractionDigits:2});
const loadImage=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('This picture could not be opened.'));im.src=src.startsWith('assets/')?src+'?v=20261101-approved-validity7':src;});
async function api(route,data){const r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Askari-Token':window.TOKEN},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw new Error(v.error||'This step failed.');return v}
function step(n){for(let i=1;i<=3;i++)$('step'+i).hidden=i!==n;document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',+b.dataset.step===n));if(n===3)summary();studioUI();}
function activeProducts(){return products.filter(p=>!p.excluded)}
function errors(p){if(p.excluded)return [];const r=[];if(!p.name.trim())r.push('missing name');if(!imageList(p).length)r.push('missing image');else if(!p.confirmed)r.push('check images and packs');r.push(...groupErrors(p),...layoutIssues(p));if(!(p.retail>0))r.push('missing regular price');if(!(p.offer>0))r.push('missing offer price');if(p.offer>p.retail)r.push('offer is higher than regular price');return r}
function setDateMode(value){noDate=!!value;$('limitedTime').setAttribute('aria-pressed',String(noDate));$('start').disabled=noDate;$('end').disabled=noDate;$('dateHint').textContent=noDate?'Limited time offer: no date or validity label will appear on the posts.':'One date shows its weekday, such as SUNDAY. Two different dates show the offer period, directly under your logo.';}
function dateError(){if(noDate)return '';const a=$('start').value,b=$('end').value;if(!a&&!b)return 'Set an offer date or a date range before exporting.';for(const value of [a,b].filter(Boolean)){const date=new Date(value+'T12:00:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.getFullYear()!==+value.slice(0,4)||date.getMonth()+1!==+value.slice(5,7)||date.getDate()!==+value.slice(8,10))return 'Choose a valid calendar date.';}if(a&&b&&b<a)return 'The end date must be after the start date.';return ''}
function offerDateLabel(){const from=$('start').value,to=$('end').value;if(!from&&!to)return {heading:'OFFER VALIDITY',text:'ADD OFFER DATE'};if(dateError())return {heading:'OFFER VALIDITY',text:'CHECK OFFER DATES'};if(!from||!to||from===to)return {heading:'VALID ON',text:new Date((from||to)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long'}).toUpperCase()};return {heading:'VALID FROM  •  TO',text:from.slice(0,4)===to.slice(0,4)?dateString(from).replace(/ \d{4}$/,'')+' — '+dateString(to):dateString(from)+' — '+dateString(to)};}
function dateString(s){return new Date(s+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase()}
function clearValidity(v){return noDate?null:validityArtwork(v)}
function fit(text,x,y,width,size,color,bold=true,align='center'){ctx.font=`${bold?'700':'500'} ${size}px Segoe UI, Arial`;while(ctx.measureText(text).width>width&&size>12){size--;ctx.font=`${bold?'700':'500'} ${size}px Segoe UI, Arial`}ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(text,x,y);return {size,width:ctx.measureText(text).width}}
function cropBounds(im){const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const z=c.getContext('2d');z.drawImage(im,0,0);const a=z.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=-1,b=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(a[(y*c.width+x)*4+3]>18){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}}return r<0?{x:0,y:0,w:im.width,h:im.height}:{x:l,y:t,w:r-l+1,h:b-t+1}}
function cleanWhiteEdges(im){
 const c=document.createElement('canvas'),scale=Math.min(1,1400/Math.max(im.width,im.height));c.width=Math.round(im.width*scale);c.height=Math.round(im.height*scale);const z=c.getContext('2d',{willReadFrequently:true});z.drawImage(im,0,0,c.width,c.height);const w=c.width,h=c.height,d=z.getImageData(0,0,w,h),a=d.data;
 const white=i=>{const j=i*4;return a[j+3]>240&&Math.min(a[j],a[j+1],a[j+2])>=240&&Math.max(a[j],a[j+1],a[j+2])-Math.min(a[j],a[j+1],a[j+2])<15};
 let n=0;for(let x=0;x<w;x++)n+=white(x)+white((h-1)*w+x);for(let y=1;y<h-1;y++)n+=white(y*w)+white(y*w+w-1);if(n/(2*w+2*h-4)<.93)return null;
 const q=new Int32Array(w*h),seen=new Uint8Array(w*h);let head=0,tail=0;const push=i=>{if(!seen[i]&&white(i)){seen[i]=1;q[tail++]=i}};for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}for(let y=1;y<h-1;y++){push(y*w);push(y*w+w-1)}
 while(head<tail){const i=q[head++],x=i%w;if(x)push(i-1);if(x<w-1)push(i+1);if(i>=w)push(i-w);if(i<w*(h-1))push(i+w)}if(tail<w*h*.05||tail>w*h*.985)return null;
 let l=w,r=-1,t=h,b=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!seen[i]&&a[i*4+3]>10){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}}if(Number(l<w*.06)+Number(r>w*.94)+Number(t<h*.06)+Number(b>h*.94)>=3)return null;
 for(let i=0;i<tail;i++)a[q[i]*4+3]=0;z.putImageData(d,0,0);return c.toDataURL('image/png');
}
async function picture(data){
 if(!/^data:image\/(png|jpeg|webp);base64,/.test(data.src||''))throw new Error('Use a PNG, JPG or WebP picture.');if(data.src.length>20*1024*1024)throw new Error('Picture is too large.');
 const originalSrc=data.originalSrc||data.src;let im=await loadImage(data.src),src=data.src,processing=data.processing||'',needsIsolation=!!data.needsIsolation;
 // White packaging can connect to a white backdrop. Do not erase it by colour.
 // Opaque new photos use the foreground mask; every new cutout needs review.
 if(!data.originalSrc&&!data.isolated&&outsideBackground(im)){
  try{const result=await api('isolate',{src});src=result.src;im=await loadImage(src);processing=result.processing;needsIsolation=outsideBackground(im);}
  catch(e){needsIsolation=true;processing='Background needs cleanup: '+e.message;}
 }
 return {...data,originalSrc,src,img:im,bounds:cropBounds(im),outsideBackground:outsideBackground(im),needsIsolation,processing};
}
function draw(p=products[selected]){
 ctx.clearRect(0,0,W,H);if(!art||!design)return;ctx.drawImage(art,0,0,W,H);const l=design.layout,v=l.validity;
 if(design.custom){
   if(customLogo)drawSceneLogo(art,customLogo);
   if(customFooter)ctx.drawImage(customFooter,60,1805,1507,175);
   ctx.fillStyle='#173b3dee';ctx.beginPath();ctx.roundRect(1010,95,520,260,30);ctx.fill();fit($('headline').value||'SPECIAL OFFERS',1270,245,465,52,'#fff4d9');
   for(const cy of [l.regular_center_y,l.offer_center_y]){ctx.fillStyle='#fff4dc';ctx.strokeStyle='#b18c49';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(l.price_center_x*W-235,cy*H-82,470,174,20);ctx.fill();ctx.stroke()}
 }
 clearValidity(v);
 if(!p)return;
 const group=displayPictures(p),boxes=productGeometry(p,l);p.renderedPictures=boxes;
 for(let i=0;i<group.length;i++){
  const pic=group[i],b=pic.bounds,r=boxes[i];productShadow(r,pic);
  ctx.drawImage(pic.img,b.x,b.y,b.w,b.h,r.x,r.y,r.w,r.h);
 }
 const details=displayDetails(p);p.renderedPack=details?packPlaque(details,l):null;
 p.renderedPrices=regions(l).map((r,i)=>priceText(i?'OFFER PRICE':'REGULAR PRICE',[p.retail,p.offer][i]===null?'—':money([p.retail,p.offer][i]),r,design.inks[i],i===0));
}
function doubleDateEvent(value){const clean=norm(value).replace(/\b(?:sale|sales|offer|offers)\b/g,'').trim();let m=clean.match(/^(\d{1,2}) (\d{1,2})$/);if(!m&&/^\d{2}$|^\d{4}$/.test(clean)){const n=clean.length/2;m=[clean,clean.slice(0,n),clean.slice(n)];}if(!m||+m[1]!==+m[2]||+m[1]<1||+m[1]>12)return null;return `${+m[1]}.${+m[1]} Sale`;}
function renderGallery(){const query=norm($('event').value),aliases={ramzan:'ramadan',ramdan:'ramadan',muharram:'muharram',eid:'eid',monthly:'monthly offers',independence:'independence day'};const q=aliases[query]||query;const sale=doubleDateEvent($('event').value);let list=sale?catalog.filter(d=>d.event===sale):/^(?:all )?double dates?(?: sales?)?$/.test(q)?catalog.filter(d=>d.collection==='double-date'):catalog.filter(d=>norm(d.event).includes(q)||norm(d.name).includes(q));$('gallery').replaceChildren();$('designCount').textContent=list.length+' designs';if(!list.length){$('galleryTitle').textContent='No saved designs for this event';return} $('galleryTitle').textContent='Choose a design';for(const d of list){const b=document.createElement('button');b.classList.toggle('selected',design?.id===d.id);const im=document.createElement('img');im.src=d.thumb+'?v=20261101-approved-validity7';im.loading='lazy';im.alt=d.name;b.append(im,document.createTextNode(d.name));b.onclick=guard(()=>selectDesign(d));$('gallery').append(b)}return list}
async function selectDesign(d){if(exporting)throw new Error('Wait for the current export.');const version=++loadVersion;const [a,f]=await Promise.all([loadImage(d.art),loadImage(d.frame)]);if(version!==loadVersion)return;const keepNoDate=noDate&&design?.event===d.event;design=structuredClone(d);ensureAnchors(design);art=a;frame=f;setDateMode(d.event==='Limited Time Offer'||keepNoDate);placementControls();renderGallery();draw();studioUI();say('Selected '+d.name+'. The whole batch will use this template.');}
const controls=[['product_center_x','Product left / right',.15,.55],['product_base_y','Podium surface height',.55,.88],['product_max_width','Product width',.12,.45],['product_max_height','Product height',.15,.55],['price_center_x','Price cards left / right',.60,.85],['regular_center_y','Regular price height',.30,.67],['offer_center_y','Offer price height',.40,.77],['price_safe_width','Price text width',.10,.29],['description_center_x','Pack label left / right',.15,.55],['description_center_y','Pack label on podium front',.55,.89]];
function ensureAnchors(d){d.layout.description_center_x??=d.layout.product_center_x;d.layout.description_center_y??=Math.min(.875,d.layout.product_base_y+.042);}
function placementControls(){$('placement').replaceChildren();for(const [key,title,min,max] of controls){if(!design.custom&&['price_center_x','regular_center_y','offer_center_y','price_safe_width'].includes(key))continue;const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step='.001';input.value=design.layout[key];input.dataset.key=key;input.oninput=()=>{const l=design.layout,delta=+input.value-l[key];l[key]=+input.value;if(l.priceRegions){if(key==='price_center_x')l.priceRegions.forEach(r=>r.x+=delta);if(key==='regular_center_y')l.priceRegions[0].y+=delta;if(key==='offer_center_y')l.priceRegions[1].y+=delta;if(key==='price_safe_width')l.priceRegions.forEach(r=>{r.x-=delta/2;r.w+=delta;});}draw();summary()};label.append(input);$('placement').append(label)}}
function mapping(rs){if(rs.length<2)throw new Error('No product rows found.');rows=rs;const headers=rs[0],spec=[['name','Product name',[/product name/,/item name/,/^name$/,/description/]],['retail','Regular price',[/retail/,/regular/,/original/,/mrp/]],['offer','Offer price',[/offer/,/sale price/,/selling/]],['description','Details / size',[/^size$/,/pack size/,/detail/]],['discount','Discount %',[/discount/]],['image','Image filename / URL',[/image/,/filename/,/picture/]]];$('mapFields').replaceChildren();for(const [key,title,patterns] of spec){const label=document.createElement('label');label.textContent=title;const s=document.createElement('select');s.id='map-'+key;s.add(new Option('Not used','-1'));headers.forEach((h,i)=>s.add(new Option(h||'Column '+(i+1),i)));s.value=String(headers.findIndex(h=>patterns.some(re=>re.test(norm(h)))));label.append(s);$('mapFields').append(label)}$('mapping').hidden=false;}
function applyVerifiedDetails(p){const verified=imageList(p).find(im=>im.verifiedMatch&&im.displayDetails);if(verified&&(!p.description||p.description===inferDetails(p.name)))p.description=verified.displayDetails;}
function inferDetails(name){
 if(/\ball\s+sizes\b/i.test(name))return /jumbo/i.test(name)?'JUMBO PACK • ALL SIZES':'ALL SIZES';
 const box=String(name).match(/\brs\.?\s*(\d+)\s*box\b/i);if(box)return 'RS '+box[1]+' BOX';
 const match=String(name).match(/\b(\d+(?:\.\d+)?)\s*(kg|gm|g|ml|litres?|liters?|litrs?|ltrs?|ltr|l|pcs)\b/i);
 let size='';if(match){const unit=match[2].toLowerCase();size=match[1]+' '+(/^l/.test(unit)&&unit!=='ml'?'LITRE':unit==='gm'?'G':unit.toUpperCase());}
 if(/\b(?:corton|carton|cartoon|case)\b/i.test(name))return [size.replace(' LITRE',' L'),'FULL CARTON'].filter(Boolean).join(' • ');
 return size||(/\bbox\b/i.test(name)?'FULL BOX':'');
}
async function importRows(){if(searching||exporting)throw new Error('Stop the current search before replacing this batch.');const ni=+$('map-name').value;if(ni<0)throw new Error('Choose the product-name column.');const get=(r,key)=>r[+$('map-'+key).value]??'';products=rows.slice(1).filter(r=>String(r[ni]??'').trim()).map((r,i)=>{const p={id:crypto.randomUUID(),row:i+2,name:String(r[ni]).trim(),description:String(get(r,'description')).trim()||inferDetails(r[ni]),retail:amount(get(r,'retail')),offer:amount(get(r,'offer')),discount:amount(get(r,'discount')),imageName:String(get(r,'image')).trim(),confirmed:false,excluded:false,picture:null,pictures:[],activePicture:0,candidates:[],groupSpec:productGroup(String(r[ni]).trim())};if(p.offer===null&&p.retail>0&&p.discount>0&&p.discount<100){p.offer=Math.round(p.retail*(1-p.discount/100)*100)/100;p.calculation='Offer calculated from Excel regular price and discount';}return p});if(!products.length)throw new Error('The product table is empty.');selected=0;$('mapping').hidden=true;refresh();say('Imported '+products.length+' products. Find images, review the packs, then export.');if($('autoImages').checked)await findImages();}
function refresh(){
 $('batchTools').hidden=!products.length;$('editor').hidden=selected<0;
 const drop=$('previewProduct');drop.replaceChildren(new Option('Background only','-1'));products.forEach((p,i)=>drop.add(new Option(p.name,String(i))));drop.value=String(selected);
 const list=$('products');list.replaceChildren();products.forEach((p,i)=>{const b=document.createElement('button');b.className='productRow'+(i===selected?' selected':'');const im=document.createElement('img');if(p.picture)im.src=p.picture.src;im.alt=p.name;const title=document.createElement('span');title.textContent=p.name;const sub=document.createElement('small');sub.textContent=[p.retail===null?'Regular —':money(p.retail),p.offer===null?'Offer —':money(p.offer)].join(' · ');title.append(sub);const match=document.createElement('small');match.textContent=p.picture?.sourceTitle||p.note||'';match.title=p.note||match.textContent;title.append(match);const status=document.createElement('span');const err=errors(p);status.className=err.length?'needs':'ready';status.textContent=p.excluded?'Excluded':err.length?'Review':'Ready';b.append(im,title,status);b.onclick=()=>{selected=i;refresh()};list.append(b)});
 const p=products[selected];if(p){groupEditor(p);$('editTitle').textContent='Review product '+(selected+1)+' of '+products.length;for(const k of ['name','description','retail','offer','discount'])$(k==='name'?'productName':k).value=p[k]??'';$('excluded').checked=!!p.excluded;$('pictureNote').textContent=[p.note,...imageList(p).map(im=>im.matchWarning).filter(Boolean)].filter(Boolean).join(' ');$('candidates').replaceChildren();for(const c of p.candidates||[]){const b=document.createElement('button');b.textContent=c.store+': '+c.name;b.onclick=guard(async()=>{say('Loading the selected product photo…');await chooseCandidate(p,c,(p.groupSpec||productGroup(p.name)).mode!=='single');refresh();say('Photo loaded. Check the pack before approving.');});$('candidates').append(b)}}
 summary();draw();studioUI();
}
function summary(){const included=activeProducts(),bad=included.filter(p=>errors(p).length);$('reviewGrid').replaceChildren();for(const p of included){const b=document.createElement('button');const im=document.createElement('img');if(p.picture)im.src=p.picture.src;im.alt=p.name;const name=document.createElement('strong');name.textContent=p.name;const note=document.createElement('small');note.textContent=p.picture?.sourceTitle||'Image missing';const state=document.createElement('small');state.textContent=p.confirmed?'Approved':p.note||'Needs review';b.append(im,name,note,state);b.onclick=()=>{selected=products.indexOf(p);step(2);refresh()};$('reviewGrid').append(b)}$('exportSummary').textContent=`${included.length} products included · ${included.length-bad.length} ready · ${products.length-included.length} excluded`;$('issues').replaceChildren();const dated=dateError();for(const s of [...(dated?[dated]:[]),...bad.map(p=>p.name+': '+errors(p).join(', '))]){const d=document.createElement('div');d.className='issue';d.textContent=s;$('issues').append(d)}$('exportAll').disabled=exporting||!included.length||bad.length>0||!!dated;$('exportOne').disabled=exporting||selected<0||errors(products[selected]).length>0||products[selected]?.excluded||!!dated;}
function productGroup(name){
 name=String(name??'');
 const ruleKey=s=>norm(s).replace(/(\d)(ml|kg|gm|g)\b/g,'$1 $2');const override=productRules.find(r=>r.aliases.some(a=>ruleKey(a)===ruleKey(name)));if(override)return structuredClone(override.groupSpec);
 const mode=/\ball\s+sizes\b/i.test(name)?'sizes':/\ball\s+vari(?:ants|ents|eties)\b/i.test(name)?'variants':'single';
 const base=name.replace(/\ball\s+(?:sizes|vari(?:ants|ents|eties))\b/ig,'').trim();
 if(mode!=='single')return {mode,queries:[base],minimum:mode==='sizes'?1:2};
 if(/head\s*(?:&|and)\s*shoulders|johnson\s*(?:&|and)\s*johnson|cookies?\s*(?:&|and)\s*cream|cream\s*(?:&|and)\s*choc/i.test(name))return {mode:'single',queries:[name],minimum:1};
 const parts=name.split(/\s*&\s*|\s+and\s+/i),brand=name.split(/\s+/)[0],size=name.match(/\b\d+(?:\.\d+)?\s*(?:kg|gm|g|ml|litres?|liters?|ltr|l|pcs)\b/i)?.[0];
 const queries=parts.map((v,i)=>{v=v.trim();if(i&&!v.toLowerCase().split(/\s+/).includes(brand.toLowerCase()))v=brand+' '+v;if(size&&!/\b\d+(?:\.\d+)?\s*(?:kg|gm|g|ml|litres?|liters?|ltr|l|pcs)\b/i.test(v))v+=' '+size;return v;});
 return parts.length>1&&parts.length<=12?{mode:'combined',queries,minimum:queries.length}:{mode:'single',queries:[name],minimum:1};
}
function imageList(p){if(!p)return [];if(!p.pictures?.length)return p.picture?[p.picture]:[];if(p.picture&&!p.pictures.includes(p.picture))return [p.picture];return p.pictures;}
// Keep the complete library; only the poster uses four representative variants.
function displayPictures(p){const list=imageList(p),spec=p?.groupSpec||productGroup(p?.name);if(spec.mode!=='variants'||p.compositeGroup||list.length<=4)return list;return Array.from({length:4},(_,i)=>list[Math.round(i*(list.length-1)/3)]);}
function displayDetails(p){const text=String(p.description||'').replace(/\s*[•·]?\s*ALL\s+VARI(?:ANTS|ENTS|ETIES)\b/ig,'').trim();return (p.groupSpec||productGroup(p.name)).mode==='variants'?[text,'ALL VARIANTS'].filter(Boolean).join(' • '):String(p.description||'');}
function setPictures(p,list,index=0){p.pictures=list;p.activePicture=Math.max(0,Math.min(index,list.length-1));p.picture=list[p.activePicture]||null;}
function setActivePicture(p,pic){const list=imageList(p).slice();list[p.activePicture||0]=pic;setPictures(p,list,p.activePicture||0);p.confirmed=false;}
function isolationIssue(p,im){return !!im.needsIsolation||(!im.isolated&&!!im.outsideBackground);}
function groupErrors(p){
 const spec=p.groupSpec||productGroup(p.name),list=imageList(p);
 if(new Set(list.map(im=>im.src)).size!==list.length)return ['duplicate photo in group'];
 if(list.some(im=>isolationIssue(p,im)))return ['remove advertising background from the marked photo'];
 if(['single','sizes'].includes(spec.mode)&&list.length>1)return ['use one representative pack; other variants were not requested'];
 if(p.compositeGroup&&spec.mode==='variants')return ['use separate variant pack photos so the poster can show up to four'];
 if(p.compositeGroup)return [];
 if(spec.mode==='combined'){const missing=spec.queries.filter(q=>!list.some(pic=>norm(pic.memberQuery)===norm(q))).map(q=>'missing '+q);if(!missing.length&&list.length!==spec.queries.length)missing.push('use one image of each named product');return missing;}
 if(spec.mode==='variants'&&list.length<(spec.minimum||2))return ['add the other '+spec.mode+' or mark a complete group photo'];
 if(spec.mode==='variants'){const identities=list.map(im=>im.variantKey||im.src);if(new Set(identities).size!==identities.length)return ['duplicate variant; use distinct packs'];}
 return [];
}
function inferredMember(p){const spec=p.groupSpec||productGroup(p.name);return spec.mode==='combined'?(spec.queries.find(q=>!imageList(p).some(pic=>pic.memberQuery===q))||spec.queries[0]):spec.queries[0];}
async function chooseCandidate(p,c,add=false){
 if(['single','sizes'].includes((p.groupSpec||productGroup(p.name)).mode))add=false;
 const expected=p.name,data=await api('fetch',{url:c.url});if(!products.includes(p)||p.name!==expected)return;
 data.sourceTitle=c.name;data.sourcePage=c.url;data.memberQuery=c.memberQuery||inferredMember(p);data.variantKey=c.variantKey;let pic=await picture(data);
 if(/shampoo/i.test(p.name)&&pic.bounds.w/pic.bounds.h>.72&&!p.compositeGroup){
   // A narrow gallery photo may show the back of the bottle. Keep the front
   // and request a cutout instead of silently substituting another view.
   pic.needsIsolation=pic.bounds.w/pic.bounds.h>.72;
 }
 const list=imageList(p).slice();if(add){if(list.some(im=>im.src===pic.src||im.sourcePage===pic.sourcePage))throw new Error('This photo is already in the group.');if(list.length>=24)throw new Error('Use up to 24 photos in one post.');list.push(pic);setPictures(p,list,list.length-1);}else if(list.length)setActivePicture(p,pic);else setPictures(p,[pic]);
 p.confirmed=false;p.note='Review the exact variant and pack: '+c.name;
}
async function findImages(){
 if(searching||exporting)return;searching=true;stopSearch=false;$('findImages').disabled=true;$('stopImages').hidden=false;
 try{for(const p of products){
  if(stopSearch)break;if(p.excluded||imageList(p).length)continue;const expected=p.name;say('Finding images — '+p.name);
  try{
   if(/^https:\/\//i.test(p.imageName)){const data=await api('fetch',{url:p.imageName,direct:/\.(?:png|jpe?g|webp)(?:\?|$)/i.test(p.imageName)});if(p.name===expected)setPictures(p,[await picture({...data,memberQuery:inferredMember(p)})]);p.note='Spreadsheet picture — review the group and exact pack.';}
   else{
    const data=await api('lookup-group',{name:expected});if(p.name!==expected)continue;p.groupSpec=data.spec;p.compositeGroup=!!data.compositeGroup;
    const pics=[];for(const im of data.pictures||[])pics.push(await picture(im));setPictures(p,pics);applyVerifiedDetails(p);p.candidates=data.candidates||[];
    if(data.cached||(pics.length&&pics.every(im=>im.verifiedMatch&&!im.matchWarning)&&!groupErrors(p).length)){p.confirmed=true;p.note=data.cached?'Previously approved local image group.':'Verified saved packaging reused.';}
    else{
     if(p.groupSpec.mode==='combined'){
      for(const query of p.groupSpec.queries){if(stopSearch)break;if(imageList(p).some(im=>im.memberQuery===query))continue;for(const c of p.candidates.filter(c=>c.memberQuery===query&&c.autoEligible).slice(0,3)){try{await chooseCandidate(p,c,true);break;}catch(e){p.note=e.message;}}}
     }else if(['single','sizes'].includes(p.groupSpec.mode)&&!pics.length){for(const c of p.candidates.filter(c=>c.autoEligible).slice(0,3)){try{await chooseCandidate(p,c);break;}catch(e){p.note=e.message;}}}
     else if(p.groupSpec.mode==='variants'&&!pics.length){
      for(const c of p.candidates.slice(0,12)){if(stopSearch)break;try{await chooseCandidate(p,c,true);}catch(e){p.note=e.message;}}
     }
     p.note=['single','sizes'].includes(p.groupSpec.mode)?'Review the exact pack before approving.':'Found '+imageList(p).length+' pictures. Check every named product, pack and variant; search results may miss variants.';
     if(!imageList(p).length)p.note=data.errors?.join(' ')||'No matching picture. Add a product link or local image.';
    }
   }
  }catch(e){p.note=e.message;}refresh();
 }say(stopSearch?'Search stopped. Found pictures are kept.':'Image search finished. Check the full groups before approving.');
 }finally{searching=false;$('findImages').disabled=false;$('stopImages').hidden=true;refresh();}
}
async function approve(p){if(!imageList(p).length)throw new Error('Add an image first.');const missing=groupErrors(p);if(missing.length)throw new Error(missing.join(', '));await api('remember',{name:p.name,pictures:imageList(p).map(im=>Object.fromEntries(Object.entries(im).filter(([k])=>['src','source','sourcePage','sourceTitle','memberQuery','variantKey','needsIsolation','isolated','packageKind','verifiedMatch','referenceKey','displayDetails','matchWarning','packageForm'].includes(k)))),compositeGroup:!!p.compositeGroup});p.confirmed=true;}
function groupEditor(p){
 const list=imageList(p),spec=p.groupSpec||productGroup(p.name);$('groupNote').textContent=spec.mode==='single'?'Single product':spec.mode==='combined'?'Required: '+spec.queries.join(' + '):spec.mode==='sizes'?'One representative pack · ALL SIZES. This does not request other variants.':'Poster shows up to four distinct packs, with ALL VARIANTS underneath. The other saved variants remain in your library.';
 $('pictureStrip').replaceChildren();list.forEach((im,i)=>{const b=document.createElement('button'),img=document.createElement('img'),t=document.createElement('small');img.src=im.src;t.textContent=(isolationIssue(p,im)?'Background needs cleanup · ':'')+(im.sourceTitle||'Picture '+(i+1));b.classList.toggle('selected',i===(p.activePicture||0));b.append(img,t);b.onclick=()=>{setPictures(p,list,i);refresh();};$('pictureStrip').append(b);});
 $('webPictures').href='https://www.google.com/search?tbm=isch&q='+encodeURIComponent((spec.queries[0]||p.name)+' Pakistan product');const menu=$('memberQuery');menu.replaceChildren();spec.queries.forEach(q=>menu.add(new Option(q,q)));menu.value=p.picture?.memberQuery||spec.queries[0];$('memberLabel').hidden=spec.mode!=='combined';$('compositeGroup').checked=!!p.compositeGroup;$('compositeLabel').hidden=['single','sizes'].includes(spec.mode);$('addPictures').parentElement.hidden=['single','sizes'].includes(spec.mode);
}

async function download(blob,name){
 if(window.SAVE_ROOT){const response=await fetch('/api/save-output',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Askari-Token':window.TOKEN,'X-Askari-Filename':encodeURIComponent(name)},body:blob});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save the output.');say('Saved to '+result.path);return result;}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return null;
}
const safeName=s=>String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').trim().slice(0,100)||'Askari';
const png=()=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed.')),'image/png'));
function exportCheck(p){if(searching)throw new Error('Stop image search before exporting.');if(dateError())throw new Error(dateError());if(!design||!art)throw new Error('Choose a design first.');if(p&&errors(p).length)throw new Error(errors(p).join(', '));}
async function exportAll(){if(exporting)return;exportCheck();const included=activeProducts();if(!included.length)throw new Error('Import products first.');if(included.some(p=>errors(p).length))throw new Error('Review all included products, or explicitly exclude unfinished rows.');exporting=true;const disabled=[...document.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);disabled.forEach(([el])=>el.disabled=true);summary();const entries=[],report=[];let bytes=0;try{for(let i=0;i<included.length;i++){const p=included[i];say('Exporting '+(i+1)+' of '+included.length+' — '+p.name);draw(p);const data=new Uint8Array(await (await png()).arrayBuffer());bytes+=data.length;if(bytes>650*1024*1024)throw new Error('This batch exceeds 650 MB. Split the spreadsheet into smaller batches.');entries.push({name:String(i+1).padStart(3,'0')+' - '+safeName(p.name)+'.png',data});report.push({name:p.name,details:p.description,regular_price:p.retail,offer_price:p.offer,calculation:p.calculation||null,displayed_details:displayDetails(p),saved_picture_count:imageList(p).length,image_sources:displayPictures(p).map(im=>({title:im.sourceTitle,member:im.memberQuery,source:im.sourcePage||im.source||'Local upload'}))});await new Promise(r=>setTimeout(r,0));}entries.push({name:'Batch report.json',data:new TextEncoder().encode(JSON.stringify({template:design.name,no_date:noDate,valid_from:noDate?null:$('start').value,valid_to:noDate?null:$('end').value,products:report,excluded:products.filter(p=>p.excluded).map(p=>p.name)},null,2))});const saved=await download(zipBlob(entries),safeName(design.event)+' - '+included.length+' posts.zip');say(saved?'Saved all '+included.length+' posts to '+saved.path:'Exported all '+included.length+' posts. Your ZIP download includes the batch report.');}finally{exporting=false;disabled.forEach(([el,was])=>el.disabled=was);summary();draw()}}
async function toData(im){const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);return c.toDataURL('image/png')}
async function saveProject(){if(searching||exporting)throw new Error('Stop the active batch task before saving.');if(!design)throw new Error('Choose a design first.');const ps=products.map(p=>{const {picture:unused,pictures:old,renderedPictures,...rest}=p;return {...rest,pictures:imageList(p).map(im=>Object.fromEntries(Object.entries(im).filter(([k])=>!['img','bounds'].includes(k))))};});const project={format:'askari-batch-studio',version:2,design,art:await toData(art),frame:await toData(frame),customLogo:customLogo?await toData(customLogo):null,customFooter:design.custom&&customFooter?await toData(customFooter):null,noDate,start:$('start').value,end:$('end').value,headline:$('headline').value,products:ps};const saved=await download(new Blob([JSON.stringify(project)],{type:'application/json'}),safeName(design.event)+' - project.json');say(saved?'Project saved to '+saved.path:'Project saved with the template, dates, prices and images. Reopen it offline.');}
async function openProject(file){if(searching||exporting)throw new Error('Stop the active batch task first.');if(file.size>500*1024*1024)throw new Error('Project exceeds 500 MB.');const data=JSON.parse(await file.text());if(data.format!=='askari-batch-studio'||![1,2].includes(data.version)||!Array.isArray(data.products)||data.products.length>2000)throw new Error('Unsupported Askari project.');const d=data.design;const checked=catalog.find(c=>c.id===d?.id&&!d.custom);if(checked&&(d.layout?.calibrationVersion||0)<(checked.layout?.calibrationVersion||6))d.layout=structuredClone(checked.layout);if(!d?.layout||!Array.isArray(d.inks)||d.inks.length!==2||!d.inks.every(c=>/^#[0-9a-f]{6}$/i.test(c)))throw new Error('Invalid template data.');ensureAnchors(d);for(const [k,,min,max] of controls)if(!Number.isFinite(d.layout[k])||d.layout[k]<min||d.layout[k]>max)throw new Error('Invalid template placement: '+k);for(const src of [data.art,data.frame,...[data.customLogo,data.customFooter].filter(Boolean)])if(!/^data:image\/(png|jpeg|webp);base64,/.test(src))throw new Error('Invalid project image.');const refreshBrand=checked&&((d.brandingVersion||0)<(checked.brandingVersion||0)||(checked.artRevision&&d.artRevision!==checked.artRevision));if(refreshBrand){d.brandingVersion=checked.brandingVersion;d.artRevision=checked.artRevision;d.backgroundRevision=checked.backgroundRevision;d.backgroundStyle=checked.backgroundStyle;d.branding=structuredClone(checked.branding);if(checked.footer)d.footer=structuredClone(checked.footer);d.layout.validity.colors=structuredClone(checked.layout.validity.colors);}const [a,f,logo,foot]=await Promise.all([loadImage(refreshBrand?checked.art:data.art),loadImage(refreshBrand?checked.frame:data.frame),data.customLogo?loadImage(data.customLogo):null,data.customFooter?loadImage(data.customFooter):customFooter]);const restored=[];for(const p of data.products){const list=[];for(const im of p.pictures||(p.picture?[p.picture]:[])){if(list.length>=24)throw new Error('Too many images in a row.');list.push(await picture(im));}const item={...p,name:String(p.name??''),description:/\ball\s+sizes\b/i.test(p.name)?inferDetails(p.name):String(p.description??''),retail:amount(p.retail),offer:amount(p.offer),discount:amount(p.discount),confirmed:!!p.confirmed,excluded:!!p.excluded,groupSpec:productGroup(p.name),candidates:[]};setPictures(item,list,p.activePicture||0);restored.push(item);}design=d;art=a;frame=f;customLogo=logo;customFooter=foot;products=restored;selected=products.length?0:-1;$('event').value=d.event;$('start').value=data.start||'';$('end').value=data.end||'';setDateMode(typeof data.noDate==='boolean'?data.noDate:d.event==='Limited Time Offer');$('headline').value=data.headline||'';placementControls();renderGallery();refresh();step(products.length?2:1);say('Project reopened. All included artwork and product images are available offline.');}
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>step(+b.dataset.step));
$('limitedTime').onclick=()=>{setDateMode(!noDate);draw();summary();say(noDate?'Limited time offer enabled. Posts will have no date label.':'Date labels enabled. Choose your offer date(s).');};
$('event').oninput=()=>renderGallery();$('event').onchange=guard(async()=>{const list=renderGallery();if(list?.length&&!list.some(d=>d.id===design?.id))await selectDesign(list[0])});
$('shuffle').onclick=guard(async()=>{const list=renderGallery()||[];if(!list.length)throw new Error('No saved designs for this event. Upload a custom template.');const other=list.filter(d=>d.id!==design?.id);await selectDesign(other[Math.floor(Math.random()*other.length)]||list[0])});
$('choose').onclick=guard(()=>{if(!design)throw new Error('Select a design first.');if(dateError())throw new Error(dateError());step(2);say('Upload your Excel list. No prices are taken from shopping websites.');});
for(const id of ['start','end','headline'])$(id).oninput=()=>{draw();summary();if(dateError())say(dateError(),true)};
$('resetPlacement').onclick=guard(async()=>{const native=catalog.find(d=>d.id===design?.id);if(native)await selectDesign(native)});
$('excelFile').onchange=guard(async e=>{const f=e.target.files[0];if(!f)return;if(searching||exporting)throw new Error('Stop the active task before importing another spreadsheet.');if(f.size>20*1024*1024)throw new Error('Use a workbook smaller than 20 MB.');if(!/\.(xlsx|csv)$/i.test(f.name))throw new Error('Save old XLS files as XLSX or CSV first.');mapping(/\.csv$/i.test(f.name)?parseCSV(await f.text()):parseXLSX(await f.arrayBuffer()));say('Check the column choices and click Import products.');e.target.value='';});
$('importRows').onclick=guard(importRows);$('findImages').onclick=guard(findImages);$('stopImages').onclick=()=>{stopSearch=true;say('Stopping after the current website request…')};
$('previewProduct').onchange=()=>{selected=+$('previewProduct').value;refresh()};$('prev').onclick=()=>{if(products.length){selected=(selected-1+products.length)%products.length;refresh()}};$('next').onclick=()=>{if(products.length){selected=(selected+1)%products.length;refresh()}};
for(const k of ['name','description','retail','offer','discount'])$(k==='name'?'productName':k).oninput=()=>{const p=products[selected];if(!p)return;if(searching||exporting)return;const val=$(k==='name'?'productName':k).value;p[k]=['retail','offer','discount'].includes(k)?amount(val):val;if(k==='name'){p.confirmed=false;p.candidates=[];p.groupSpec=productGroup(p.name);p.compositeGroup=false}if(k==='discount'&&p.retail>0&&p.discount>0&&p.discount<100){p.offer=Math.round(p.retail*(1-p.discount/100)*100)/100;$('offer').value=p.offer;p.calculation='Offer calculated from entered discount';}else if(k==='offer')delete p.calculation;summary();draw();};
$('excluded').onchange=()=>{if(products[selected])products[selected].excluded=$('excluded').checked;refresh()};
$('approve').onclick=guard(async()=>{await approve(products[selected]);refresh();say('Image approved and cached for this product.');});
$('approveAll').onclick=guard(async()=>{if(searching||exporting)throw new Error('Stop the active task before approving.');let count=0;for(const p of products)if(!p.excluded&&p.picture&&!p.confirmed&&!imageList(p).some(im=>im.matchWarning)){await approve(p);count++}refresh();say('Approved '+count+' product images. Brand, shade or pack warnings need individual review; missing images still need attention.');});
$('restore').onclick=guard(async()=>{const p=products[selected];if(!p?.picture)throw new Error('No image to restore.');setActivePicture(p,await picture({...p.picture,src:p.picture.originalSrc,originalSrc:p.picture.originalSrc,processing:'Original image',isolated:false,needsIsolation:false}));p.confirmed=false;refresh();});
async function uploadPicture(p,file){if(file.size>12*1024*1024)throw new Error('Picture exceeds 12 MB.');const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});const pic=await picture({src,sourceTitle:file.name,source:'Local upload',memberQuery:inferredMember(p)});if(imageList(p).length)setActivePicture(p,pic);else setPictures(p,[pic]);p.confirmed=false;p.note=file.name+' — review the image before approving.';}
$('imageFile').onchange=guard(async e=>{if(!products[selected])return;await uploadPicture(products[selected],e.target.files[0]);refresh();e.target.value='';});
$('folderImages').onchange=guard(async e=>{if(searching||exporting)throw new Error('Stop the current task first.');let count=0;for(const f of e.target.files){const key=norm(f.name.replace(/\.[^.]+$/,'')),matches=products.filter(p=>norm(p.imageName.replace(/\.[^.]+$/,''))===key||norm(p.name)===key);for(const p of matches){await uploadPicture(p,f);count++}}refresh();say('Matched '+count+' images by exact filename. Unmatched products can use online search or Replace image.');e.target.value='';});
$('useLink').onclick=guard(async()=>{const p=products[selected];if(!p)throw new Error('Select a product.');const url=$('pictureLink').value.trim(),data=await api('fetch',{url,direct:/\.(png|jpe?g|webp)(?:\?|$)/i.test(url)});setActivePicture(p,await picture({...data,memberQuery:inferredMember(p)}));p.confirmed=false;p.note='Linked product image — check the exact pack.';refresh();});
$('reviewExport').onclick=()=>{step(3);say(noDate?'Check every pictured product and both prices. This offer has no date.':'Check every pictured product and both dates. Unfinished rows are listed below.');};$('exportAll').onclick=guard(exportAll);$('exportOne').onclick=guard(async()=>{const p=products[selected];exportCheck(p);draw(p);await download(await png(),safeName(p.name)+'.png');});
$('saveProject').onclick=guard(saveProject);$('openProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=guard(async e=>{if(e.target.files[0])await openProject(e.target.files[0]);e.target.value='';});
$('logoFile').onchange=guard(async e=>{if(!design?.custom)throw new Error('Saved designs already contain your exact logo. Upload a custom background to use another logo.');const p={};await uploadPicture(p,e.target.files[0]);customLogo=await loadImage(p.picture.originalSrc);draw();});
$('customFile').onchange=guard(async e=>{if(searching||exporting)throw new Error('Stop the active task first.');const p={};await uploadPicture(p,e.target.files[0]);const chosen=catalog[0];design={...structuredClone(chosen),id:'custom',event:'Custom campaign',name:e.target.files[0].name,custom:true,inks:['#211c1a','#211c1a']};art=await loadImage(p.picture.originalSrc);frame=await loadImage(chosen.frame);ensureAnchors(design);placementControls();renderGallery();draw();say('Custom background loaded. Adjust the product base to your podium, and align the price cards before importing.');});
window.addEventListener('beforeunload',e=>{if(products.length){e.preventDefault();e.returnValue='Save your project before closing.'}});
(async()=>{try{[catalog,productRules]=await Promise.all(['catalog.json','product-rules.json'].map(async f=>(await fetch(f)).json()));for(const event of [...new Set(catalog.map(d=>d.event))])$('events').append(new Option(event,event));[customLogo,customFooter]=await Promise.all([loadImage('brand-logo.png'),loadImage('brand-footer.png')]);const requested=new URLSearchParams(location.search).get('event')||$('event').value,initial=requested&&catalog.find(d=>norm(d.event)===norm(doubleDateEvent(requested)||requested));if(initial)$('event').value=initial.event;await selectDesign(initial||catalog[0]);}catch(e){say(e.message,true)}})();

$('memberQuery').onchange=()=>{const p=products[selected];if(p?.picture){p.picture.memberQuery=$('memberQuery').value;p.confirmed=false;refresh();}};
$('compositeGroup').onchange=()=>{const p=products[selected];if(p){p.compositeGroup=$('compositeGroup').checked;p.confirmed=false;refresh();}};
$('removePicture').onclick=guard(()=>{const p=products[selected];if(!p)throw new Error('Select a product.');const list=imageList(p).slice();list.splice(p.activePicture||0,1);setPictures(p,list);p.confirmed=false;refresh();});
$('addPictures').onchange=guard(async e=>{const p=products[selected];if(!p)return;for(const file of e.target.files){const list=imageList(p).slice();if(list.length>=24)throw new Error('Use up to 24 pictures per post.');const holder={name:p.name,groupSpec:p.groupSpec,pictures:list,picture:list[0]};await uploadPicture(holder,file);const pic=holder.picture;pic.memberQuery=inferredMember(p);setPictures(p,[...list,pic],list.length);p.confirmed=false;}refresh();e.target.value='';});

function studioUI(){
 document.body.classList.toggle('hasProducts',products.length>0);
 const uploadTitle=document.querySelector('.upload strong');if(uploadTitle)uploadTitle.textContent=products.length?'Replace your product list':'Choose your product list';
 if($('selectedDesignName'))$('selectedDesignName').textContent=design?.name||'Live preview';
 const included=activeProducts(),ready=included.filter(p=>!errors(p).length).length;
 if($('batchStats')){$('batchStats').hidden=!products.length;$('batchStats').replaceChildren();for(const [n,label] of [[included.length,'Products'],[ready,'Ready to export'],[included.length-ready,'Need a look']]){const item=document.createElement('div'),value=document.createElement('strong'),caption=document.createElement('span');value.textContent=n;caption.textContent=label;item.append(value,caption);$('batchStats').append(item)}}
 $('previewState').textContent=products[selected]?((selected+1)+' / '+products.length+' products'):'Background preview';
}
async function refreshProductPictures(){
 const original=products[selected];if(!original)throw new Error('Select a product first.');if(searching||exporting)throw new Error('Wait for the current task.');
 const index=selected,expected=original.name;searching=true;$('refreshPictures').disabled=true;say('Finding clean photos for '+expected+'…');
 try{
  const data=await api('lookup-group',{name:expected,refresh:true});
  const holder={...original,pictures:[],picture:null,candidates:data.candidates||[],groupSpec:data.spec,compositeGroup:false,confirmed:false};
  if(products[index]!==original||original.name!==expected)return;
  products[index]=holder;
  try{
   const pics=[];for(const im of data.pictures||[])pics.push(await picture(im));setPictures(holder,pics);
   for(const c of holder.candidates.filter(c=>holder.groupSpec.mode==='variants'||c.autoEligible).slice(0,12)){
    if(['single','sizes','variants'].includes(holder.groupSpec.mode)&&imageList(holder).length)break;
    if(holder.groupSpec.mode==='combined'&&imageList(holder).some(im=>im.memberQuery===c.memberQuery))continue;
    try{await chooseCandidate(holder,c,true)}catch(e){holder.note=e.message;}
   }
   if(!imageList(holder).length)throw new Error(data.errors?.join(' ')||'No clean replacement found. Your existing pictures are kept.');
   holder.note='Refreshed '+imageList(holder).length+' photos. Review the exact packs and full variant coverage before approving.';
   say(holder.note);
  }catch(e){products[index]=original;throw e;}
 }finally{searching=false;$('refreshPictures').disabled=false;refresh();}
}
$('refreshPictures').onclick=guard(refreshProductPictures);
$('enlargePreview').onclick=()=>{draw();$('largePreviewImage').src=canvas.toDataURL('image/png');$('largePreviewTitle').textContent=products[selected]?.name||design?.name||'Your design';$('previewDialog').showModal();};
$('closePreview').onclick=()=>{$('previewDialog').close();$('largePreviewImage').removeAttribute('src');};
$('previewDialog').onclick=e=>{if(e.target===$('previewDialog'))$('closePreview').click();};
for(const event of ['11.11 Sale','12.12 Sale','Sunday Special','Limited Time Offer','Weekend Offers','Monthly Offers','January','August','Ramadan']){const b=document.createElement('button');b.textContent=event;b.onclick=guard(async()=>{$('event').value=event;const list=renderGallery();if(list?.length)await selectDesign(list[0]);});$('eventChips').append(b);}

async function repairBatchPhotos(){
 if(searching||exporting)throw new Error('Wait for the current task.');searching=true;stopSearch=false;$('repairBatch').disabled=true;$('stopImages').hidden=false;
 let changed=0;
 try{for(const p of products){if(stopSearch)break;if(p.excluded)continue;say('Matching your saved originals — '+p.name);try{const data=await api('lookup-group',{name:p.name,refresh:true,libraryOnly:true});if(!data.pictures?.length){p.note='No saved original matched. Your existing photo is kept; use a product link or check the photo.';continue;}const list=[];for(const im of data.pictures)list.push(await picture(im));setPictures(p,list);applyVerifiedDetails(p);p.groupSpec=data.spec||productGroup(p.name);p.compositeGroup=!!data.compositeGroup;p.confirmed=false;if(p.groupSpec.mode==='sizes'||/\b(?:corton|carton|cartoon|case)\b/i.test(p.name))p.description=inferDetails(p.name);p.note='Original photo restored. Review exact product and pack before approving.';changed++;}catch(e){p.note=e.message;}refresh();}say('Restored '+changed+' products from your saved photo library. Excel prices are unchanged.');}finally{searching=false;$('repairBatch').disabled=false;$('stopImages').hidden=true;refresh();}
}
$('repairBatch').onclick=guard(repairBatchPhotos);
$('removeBackground').onclick=guard(async()=>{const p=products[selected];if(!p?.picture)throw new Error('Select a product photo.');say('Removing the background on your PC…');const old=p.picture,data=await api('isolate',{src:old.originalSrc||old.src});setActivePicture(p,await picture({...old,...data,originalSrc:old.originalSrc||old.src,needsIsolation:false}));p.confirmed=false;p.note='Check that the cutout keeps every part of the packaging. Use the outline tool if it removes part of the product.';refresh();say(p.note);});

$('widerPictures').onclick=guard(async()=>{
 const p=products[selected];if(!p)throw new Error('Select a product.');if(searching||exporting)throw new Error('Wait for the current task.');
 const expected=p.name,spec=p.groupSpec||productGroup(p.name);searching=true;$('widerPictures').disabled=true;say('Searching more public stores for the exact packs…');
 try{let choices=[];for(const query of spec.queries){const found=await api('search-wide',{name:spec.mode==='variants'?expected:query});choices.push(...found.candidates.map(c=>({...c,memberQuery:query})));}if(p.name!==expected)return;p.candidates=choices;refresh();document.querySelector('.sourceChoices').open=true;say(choices.length?'Found '+choices.length+' alternatives. Choose a photo to check; your existing photos are kept.':'No exact alternative found. Search internet images or paste a product page.');}
 finally{searching=false;$('widerPictures').disabled=false;}
});

// The supplied logo sits directly on the scene. Only the background lighting
// Draw the original transparent logo directly on the natural scene.
function drawSceneLogo(background,logo){
 const b=cropBounds(logo),scale=Math.min(535/b.w,166/b.h),width=b.w*scale,height=b.h*scale;
 ctx.drawImage(logo,b.x,b.y,b.w,b.h,366-width/2,191-height/2,width,height);
}
