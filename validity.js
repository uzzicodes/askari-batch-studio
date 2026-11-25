
const validityCardSamples=new WeakMap();
function validityBlend(a,b,t){return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');}
function validityCardTheme(){
 const gold={rim:['#76501e','#cda65e','#fff1bf','#9a6d2b','#e1bf77','#79501c'],paper:['#fff8e8','#f4e6ca','#fff5e3'],shine:'#fff5db',line:'#ba975a',heading:'#584121',ink:'#382b1d',radius:24};
 // The explicitly approved t222 example stays identical to the preview.
 if(design.id==='t222')return gold;
 const name=(design.styleName||design.event||'').toLowerCase();let p={...gold};
 if(/silver|platinum|pewter|steel|slate|frost|denim|glacier|winter|january|december/.test(name))p={...p,rim:['#59626c','#b3bec8','#f7fcff','#7e8d9a','#dce5eb','#66727e'],shine:'#f4fbff',line:'#a2afb9'};
 else if(/copper|bronze|coral|raspberry|apricot|clay|ruby|peach|sienna/.test(name))p={...p,rim:['#78503b','#c59879','#ffe4cf','#9a674b','#e7b99a','#7b5039'],shine:'#fff0e1',line:'#b78c70'};
 let paper=validityCardSamples.get(art);
 if(!paper){const r=design.layout.priceRegions?.[0];if(r){const c=document.createElement('canvas');c.width=12;c.height=8;const z=c.getContext('2d',{willReadFrequently:true});z.drawImage(art,(r.x+r.w*.12)*art.width,(r.y+r.h*.12)*art.height,r.w*.76*art.width,r.h*.76*art.height,0,0,12,8);const a=z.getImageData(0,0,12,8).data,channels=[[],[],[]];for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++)channels[j].push(a[i+j]);paper='#'+channels.map(c=>c.sort((a,b)=>a-b)[Math.floor(c.length/2)].toString(16).padStart(2,'0')).join('');}else paper='#f4e6ca';validityCardSamples.set(art,paper);}
 p.paper=[validityBlend(paper,'#ffffff',.28),paper,validityBlend(paper,'#fffaf0',.17)];
 const bright=[1,3,5].map(i=>parseInt(paper.slice(i,i+2),16)).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)>140;p.ink=bright?(design.inks?.[0]||'#302b24'):'#fff8eb';p.heading=p.ink;
 // Known capsule price-card family; all other tags keep the approved rounded frame.
 if(design.sourceTemplate==='t205')p.radius=64;
 return p;
}
// Approved price-card-style validity component; native, no image generation.
function validityArtwork(v){
 const x=95,y=330,w=490,h=128,label=offerDateLabel(),p=validityCardTheme();ctx.save();ctx.translate(x,y);
 const rim=ctx.createLinearGradient(0,0,w,h);[0,.17,.37,.58,.81,1].map((v,i)=>[v,p.rim[i]]).forEach(([p,c])=>rim.addColorStop(p,c));
 ctx.shadowColor='rgba(110,74,27,.20)';ctx.shadowBlur=7;ctx.shadowOffsetY=3;ctx.fillStyle=rim;ctx.beginPath();ctx.roundRect(0,0,w,h,p.radius);ctx.fill();ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 const paper=ctx.createLinearGradient(0,0,w*.65,h);paper.addColorStop(0,p.paper[0]);paper.addColorStop(.5,p.paper[1]);paper.addColorStop(1,p.paper[2]);ctx.fillStyle=paper;ctx.beginPath();ctx.roundRect(5,5,w-10,h-10,p.radius-5);ctx.fill();
 ctx.strokeStyle=p.shine;ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(7.5,7.5,w-15,h-15,p.radius-7);ctx.stroke();ctx.strokeStyle=p.line;ctx.lineWidth=.9;ctx.beginPath();ctx.roundRect(3,3,w-6,h-6,p.radius-3);ctx.stroke();
 const heading=fit(label.heading,w/2,43,w-44,24,p.heading,true);
 const text=fit(label.text,w/2,96,w-42,label.heading==='VALID ON'?43:33,p.ink,true);
 ctx.restore();return {x,y,w,h,style:'approved price-card tag',headingSize:heading.size,textSize:text.size,textWidth:text.width,radius:p.radius};
}
