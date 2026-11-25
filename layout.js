'use strict';
function regions(l){return l.priceRegions||[l.regular_center_y,l.offer_center_y].map(y=>({x:l.price_center_x-l.price_safe_width/2,y:y-.034,w:l.price_safe_width,h:.068}));}
// Preset artwork is fixed, so its exclusion areas do not follow text sliders.
// Custom cards are drawn by the app and follow their actual drawing coordinates.
function priceArtworkRegions(l){return l.priceArtworkRegions||[l.regular_center_y,l.offer_center_y].map(y=>({x:l.price_center_x-237/W,y:y-84/H,w:474/W,h:178/H}));}
function priceClearance(l){return l.price_clearance_px??32;}
const contactProfiles=new WeakMap();
function contactProfile(pic){
 if(contactProfiles.has(pic.img))return contactProfiles.get(pic.img);
 const b=pic.bounds,c=document.createElement('canvas');c.width=96;c.height=160;
 const z=c.getContext('2d',{willReadFrequently:true});z.drawImage(pic.img,b.x,b.y,b.w,b.h,0,0,96,160);
 const a=z.getImageData(0,0,96,160).data,points=[];
 // Follow the actual visible base, including sloping carton edges and bottle
 // feet. Never cast a disconnected ellipse below an angled package.
 for(let x=0;x<96;x++){let y=159;while(y>=0&&a[(y*96+x)*4+3]<64)y--;points.push(y>=140?{x:(x+.5)/96,y:(y+1)/160}:null);}
 contactProfiles.set(pic.img,points);return points;
}
function productShadow(r,pic){
 const points=contactProfile(pic);ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 for(const [color,blur,width] of [['#00000032',8,14],['#00000075',1.5,5]]){
  ctx.strokeStyle=color;ctx.filter=`blur(${blur}px)`;ctx.lineWidth=width;ctx.beginPath();let active=false;
  for(const p of points){if(!p){active=false;continue;}const x=r.x+p.x*r.w,y=r.y+p.y*r.h+1;if(active)ctx.lineTo(x,y);else{ctx.moveTo(x,y);active=true;}}
  ctx.stroke();
 }ctx.restore();
}
function productGeometry(p,l){
 const group=displayPictures(p),surface=l.podiumSurface||{left:.055,right:.65,y:l.product_base_y};
 if(!group.length)return [];
 const base=l.product_base_y*H,left=surface.left*W,right=surface.right*W,clearance=priceClearance(l);
 const width=Math.max(1,Math.min((group.length>1?.50:.43)*W,l.product_max_width*W*(group.length>1?1.85:1.43),right-left));
 const maxHeight=Math.max(1,Math.min(l.product_max_height*H,base-.26*H));
 const gap=group.length>1?Math.min(14,width/(group.length*18)):0,ratios=group.map(pic=>pic.bounds.w/pic.bounds.h);
 const overlap=group.length>=5?.18:group.length>=4?.08:0;
 const span=ratios.reduce((a,b)=>a+b,0)-ratios.slice(0,-1).reduce((a,r,i)=>a+overlap*Math.min(r,ratios[i+1]),0);
 const gaps=gap*Math.max(0,group.length-1),cards=priceArtworkRegions(l);
 // Height determines which cards the pack passes. Feasibility is monotone:
 // a taller pack is wider and can only encounter more of the fixed cards.
 const availableRight=height=>Math.min(right,...cards.filter(t=>base-height<(t.y+t.h)*H+clearance&&base>t.y*H-clearance).map(t=>t.x*W-clearance));
 const fits=height=>span*height+gaps<=availableRight(height)-left;
 let height=Math.max(0,Math.min(maxHeight,(width-gaps)/Math.max(.1,span)));
 if(!fits(height)){let low=0,high=height;for(let i=0;i<40;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}height=low;}
 const totalWidth=span*height+gaps,edge=availableRight(height);
 const center=Math.max(left+totalWidth/2,Math.min(l.product_center_x*W,edge-totalWidth/2));
 let cursor=center-(span*height+gap*Math.max(0,group.length-1))/2;
 return group.map((pic,i)=>{const w=ratios[i]*height,r={x:cursor,y:base-height,w,h:height,bottom:base};cursor+=w+gap-overlap*Math.min(w,(ratios[i+1]||0)*height);return r;});
}
function layoutIssues(p){
 if(!design||!imageList(p).length)return [];
 const l=design.layout,s=l.podiumSurface||{left:.055,right:.65,y:l.product_base_y};
 const boxes=productGeometry(p,l),r=[];
 const checked=!design.custom&&catalog.find(d=>d.id===design.id);
 if(checked&&regions(l).some((t,i)=>{const original=regions(checked.layout)[i];return !original||t.x<original.x-.001||t.y<original.y-.001||t.x+t.w>original.x+original.w+.001||t.y+t.h>original.y+original.h+.001;}))r.push('price text moved outside the template’s checked tag face; reselect this design');
 if(Math.abs(l.product_base_y-s.y)>.006)r.push('product baseline moved off the checked podium surface');
 if(Number.isFinite(s.back)&&Number.isFinite(s.front)&&boxes.some(b=>b.bottom<s.back*H+8||b.bottom>s.front*H-8))r.push('product feet must rest inside the podium top, clear of its front rim');
 if(boxes.some(b=>b.x<s.left*W-1||b.x+b.w>s.right*W+1||b.y<.26*H-1))r.push('product does not fit the podium safe area');
 if(boxes.some(b=>b.w<1||b.h<1))r.push('no clear space for the product at this podium position');
 const gap=priceClearance(l);
 for(const b of boxes)for(const t of priceArtworkRegions(l))if(b.x<(t.x+t.w)*W+gap-.1&&b.x+b.w>t.x*W-gap+.1&&b.y<(t.y+t.h)*H+gap-.1&&b.bottom>t.y*H-gap+.1)r.push('product overlaps a price card or its decorative edges');
 return [...new Set(r)];
}
function priceText(label,value,r,color,crossed){
 const x=(r.x+r.w/2)*W,cy=(r.y+r.h/2)*H,width=r.w*W-16,height=r.h*H-14;
 ctx.save();ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=color;
 let size=76,labelSize=25,metrics;
 const measure=()=>{ctx.font=`800 ${size}px Segoe UI, Arial`;const m=ctx.measureText(value);return {w:m.width,a:m.actualBoundingBoxAscent||size*.78,d:m.actualBoundingBoxDescent||size*.1};};
 metrics=measure();while((metrics.w>width||metrics.a+metrics.d+labelSize+13>height)&&size>18){size--;metrics=measure();}
 const block=labelSize+12+metrics.a+metrics.d,top=cy-block/2;
 ctx.font=`700 ${labelSize}px Segoe UI, Arial`;while(ctx.measureText(label).width>width&&labelSize>14){labelSize--;ctx.font=`700 ${labelSize}px Segoe UI, Arial`;}
 ctx.fillText(label,x,top+labelSize);
 ctx.font=`800 ${size}px Segoe UI, Arial`;const baseline=top+25+12+metrics.a;ctx.fillText(value,x,baseline);
 if(crossed){ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-metrics.w/2,baseline-metrics.a*.43);ctx.lineTo(x+metrics.w/2,baseline-metrics.a*.43);ctx.stroke();}
 ctx.restore();return {x:x-metrics.w/2,y:baseline-metrics.a,w:metrics.w,h:metrics.a+metrics.d,size,region:r};
}
function packPlaque(text,l){
 const r=l.packRegion||{x:l.description_center_x-.15,y:l.description_center_y-.017,w:.30,h:.034};
 const x=(l.description_center_x??r.x+r.w/2)*W,y=(l.description_center_y??r.y+r.h/2)*H;
 const width=r.w*W,height=r.h*H+(design.event==='Sunday Special'?20:0),lines=String(text).split('\n');
 const event=String(design.event||'').toLowerCase();
 const theme=/ramadan|eid|muharram|chand/.test(event)?'islamic':/independence|august|defence|pakistan|quaid|iqbal|kashmir/.test(event)?'national':/winter|january|december/.test(event)?'winter':/basant/.test(event)?'kite':/mother|spring|march|april|women|birthday|anniversary|sunday/.test(event)?'floral':/autumn|october|november|september/.test(event)?'autumn':/summer|june|july|may/.test(event)?'sun':'classic';
 const style=((design.index||1)-1)%5,ink=design.branding?.dark||'#173b3f',paper=theme==='winter'?'#edf7ff':theme==='national'?'#f2fff6':theme==='floral'&&/mother|women/.test(event)?'#fff0f4':theme==='kite'?'#fff5c9':theme==='autumn'?'#fff0df':'#fff8e9',metal=design.branding?.accent||'#c6a86e';
 const sample=document.createElement('canvas');sample.width=1;sample.height=1;const z=sample.getContext('2d');z.drawImage(art,x-10,y-10,20,20,0,0,1,1);const c=z.getImageData(0,0,1,1).data;
 const lightFace=style===0||style===1||c[0]*.2126+c[1]*.7152+c[2]*.0722<115;
 ctx.save();let size=Math.min(design.event==='Sunday Special'?48:44,height-17);
 const measure=()=>{ctx.font=`800 ${size}px Segoe UI, Arial`;return lines.map(t=>ctx.measureText(t));};
 let measured=measure();while((measured.some(m=>m.width>width-74)||size*(lines.length>1?lines.length*1.18:1)>height-16)&&size>16){size--;measured=measure();}
 const a=x-width/2,b=x+width/2,t=y-height/2,u=y+height/2,bevel=Math.min(15,height*.24);
 const shape=(inset=0)=>{const left=a+inset,right=b-inset,top=t+inset,bottom=u-inset;ctx.beginPath();
  if(style===0){const e=Math.min(22,(bottom-top)*.3);ctx.moveTo(left+e,top);ctx.lineTo(right-e,top);ctx.quadraticCurveTo(right-e,top+e*.45,right-e*.55,top+e*.45);ctx.quadraticCurveTo(right,top+e*.45,right,y);ctx.quadraticCurveTo(right,bottom-e*.45,right-e*.55,bottom-e*.45);ctx.quadraticCurveTo(right-e,bottom-e*.45,right-e,bottom);ctx.lineTo(left+e,bottom);ctx.quadraticCurveTo(left+e,bottom-e*.45,left+e*.55,bottom-e*.45);ctx.quadraticCurveTo(left,bottom-e*.45,left,y);ctx.quadraticCurveTo(left,top+e*.45,left+e*.55,top+e*.45);ctx.quadraticCurveTo(left+e,top+e*.45,left+e,top);ctx.closePath();}
  else if(style===1||style===4){const notch=Math.max(2,bevel-inset*.4);ctx.moveTo(left+notch,top);ctx.lineTo(right-notch,top);ctx.lineTo(right,y);ctx.lineTo(right-notch,bottom);ctx.lineTo(left+notch,bottom);ctx.lineTo(left,y);ctx.closePath();}
  else ctx.roundRect(left,top,right-left,bottom-top,style===2?(bottom-top)/2:style===3?3:Math.max(3,10-inset));
 };
 const fill=ctx.createLinearGradient(a,t,b,u);fill.addColorStop(0,lightFace?'#fffdf8':ink);fill.addColorStop(.48,lightFace?paper:ink);fill.addColorStop(1,lightFace?(theme==='winter'?'#cbdfea':theme==='national'?'#d4e6d7':theme==='floral'&&/mother|women/.test(event)?'#ecd1db':'#e7d9be'):'#0e272d');
 shape();ctx.fillStyle=fill;ctx.shadowColor='#00000065';ctx.shadowBlur=9;ctx.shadowOffsetY=4;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle=metal;ctx.lineWidth=2.2;ctx.strokeStyle=style===0?design.inks[0]:metal;ctx.stroke();
 shape(5);ctx.strokeStyle=lightFace?'#b9a17b70':'#fff8df55';ctx.lineWidth=1;ctx.stroke();
 // Small botanical or metal inlays match the campaign's decorative language.
 ctx.fillStyle=style===0?design.inks[0]:metal;for(const side of [-1,1]){const px=x+side*(width/2-22);
  if(theme==='floral'){for(const rotation of [-.65,0,.65]){ctx.save();ctx.translate(px,y);ctx.rotate(rotation);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-6,-7,0,-12);ctx.quadraticCurveTo(6,-7,0,0);ctx.fill();ctx.restore();}ctx.strokeStyle=ink;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(px,y-2);ctx.lineTo(px,y+11);ctx.stroke();}
  else if(theme==='winter'){ctx.strokeStyle=ink;ctx.lineWidth=1.6;for(let i=0;i<6;i++){const angle=i*Math.PI/3;ctx.save();ctx.translate(px,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(11,0);ctx.moveTo(7,0);ctx.lineTo(4,-3);ctx.moveTo(7,0);ctx.lineTo(4,3);ctx.stroke();ctx.restore();}}
  else if(theme==='national'){ctx.fillStyle=ink;ctx.beginPath();ctx.arc(px,y,11,Math.PI*.3,Math.PI*1.7);ctx.bezierCurveTo(px-1,y-8,px-1,y+8,px+6.5,y+8.9);ctx.closePath();ctx.fill();ctx.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,rad=i%2?2.2:5.5;const qx=px+7+Math.cos(angle)*rad,qy=y-2+Math.sin(angle)*rad;i?ctx.lineTo(qx,qy):ctx.moveTo(qx,qy);}ctx.closePath();ctx.fill();}
  else if(theme==='islamic'){ctx.fillStyle=ink;ctx.beginPath();for(let i=0;i<16;i++){const angle=i*Math.PI/8,rad=i%2?5.5:11;const qx=px+Math.cos(angle)*rad,qy=y+Math.sin(angle)*rad;i?ctx.lineTo(qx,qy):ctx.moveTo(qx,qy);}ctx.closePath();ctx.fill();ctx.fillStyle=metal;ctx.beginPath();ctx.arc(px,y,2,0,Math.PI*2);ctx.fill();}
  else if(theme==='kite'){ctx.fillStyle=ink;ctx.beginPath();ctx.moveTo(px,y-12);ctx.lineTo(px+8,y-3);ctx.lineTo(px,y+8);ctx.lineTo(px-8,y-3);ctx.closePath();ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,y+8);ctx.quadraticCurveTo(px+9,y+13,px+2,y+16);ctx.stroke();}
  else if(theme==='sun'){ctx.strokeStyle=ink;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(px,y,5,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){const angle=i*Math.PI/4;ctx.beginPath();ctx.moveTo(px+Math.cos(angle)*8,y+Math.sin(angle)*8);ctx.lineTo(px+Math.cos(angle)*12,y+Math.sin(angle)*12);ctx.stroke();}}
  else if(theme==='autumn'){ctx.fillStyle=ink;ctx.beginPath();ctx.moveTo(px-8,y+10);ctx.quadraticCurveTo(px-12,y-9,px+9,y-12);ctx.quadraticCurveTo(px+13,y+8,px-8,y+10);ctx.fill();}
  else {ctx.beginPath();ctx.moveTo(px,y-4);ctx.lineTo(px+4,y);ctx.lineTo(px,y+4);ctx.lineTo(px-4,y);ctx.closePath();ctx.fill();}
 }
 ctx.fillStyle=lightFace?ink:paper;ctx.textAlign='center';ctx.textBaseline='alphabetic';
 lines.forEach((line,i)=>{const m=measured[i],asc=m.actualBoundingBoxAscent||size*.75,desc=m.actualBoundingBoxDescent||size*.12;ctx.fillText(line,x,y+(i-(lines.length-1)/2)*size*1.18+(asc-desc)/2);});ctx.restore();
 return {x:a,y:t,w:width,h:height,size,lines,style,textWidth:Math.max(...measured.map(m=>m.width))};
}
function outsideBackground(im){
 const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const z=c.getContext('2d',{willReadFrequently:true});z.drawImage(im,0,0);const a=z.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height;
 let transparent=0,total=0;
 for(let x=0;x<w;x++){for(const y of [0,h-1]){total++;if(a[(y*w+x)*4+3]<20)transparent++;}}
 for(let y=1;y<h-1;y++){for(const x of [0,w-1]){total++;if(a[(y*w+x)*4+3]<20)transparent++;}}
 const corners=[0,w-1,(h-1)*w,w*h-1];
 return transparent/total<.70&&!corners.every(i=>a[i*4+3]<20);
}
