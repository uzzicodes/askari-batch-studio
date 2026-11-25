"""Local batch compositor and public product-image helper. No paid services or GPU."""
import base64, hashlib, hmac, http.server, io, json, mimetypes, os, re, secrets, sys, threading, urllib.parse, urllib.request, webbrowser
from PIL import Image
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from pictures import AppError, search_store, search_daraz, search_more_stores, product_picture, remote_image
from groups import group_spec, eligible_group_candidates
from matting import isolate
import library
from identity import canonical, bulk_request, matching_reference
BASE=Path(__file__).resolve().parent
TOKEN=secrets.token_urlsafe(32)
CACHE=BASE/'Cache';CACHE.mkdir(exist_ok=True)
LOCK=threading.Lock()

def save_root():
    config=BASE/'storage.json'
    return Path(json.loads(config.read_text(encoding='utf-8'))['root']).resolve() if config.exists() else None

def save_output(handler,length):
    root=save_root()
    if root is None:raise AppError('Local output storage is not configured.')
    if not 0<length<=650*1024*1024:raise AppError('Output exceeds 650 MB.')
    name=urllib.parse.unquote(handler.headers.get('X-Askari-Filename',''))
    if not name or len(name)>180 or re.search(r'[<>:"/\\|?*\x00-\x1f]',name) or name!=Path(name).name or name.endswith(('.', ' ')):
        raise AppError('Use a plain output filename, without folders.')
    suffix=Path(name).suffix.lower()
    if suffix not in ('.json','.png','.zip'):raise AppError('Only projects, PNGs and ZIP exports can be saved.')
    folder=root/('Projects' if suffix=='.json' else 'Exports');folder.mkdir(parents=True,exist_ok=True)
    with LOCK:
        target=folder/name;counter=2
        while target.exists():
            target=folder/(Path(name).stem+' ('+str(counter)+')'+suffix);counter+=1
        if target.resolve().parent!=folder.resolve():raise AppError('Invalid output folder.')
        created=False
        try:
            with target.open('xb') as output:
                created=True
                remaining=length;first=True
                while remaining:
                    chunk=handler.rfile.read(min(1024*1024,remaining))
                    if not chunk:raise AppError('The file upload was interrupted.')
                    if first:
                        if suffix=='.png' and not chunk.startswith(b'\x89PNG\r\n\x1a\n'):raise AppError('Invalid PNG output.')
                        if suffix=='.zip' and not chunk.startswith(b'PK\x03\x04'):raise AppError('Invalid ZIP output.')
                        if suffix=='.json' and not chunk.lstrip().startswith(b'{'):raise AppError('Invalid project output.')
                        first=False
                    output.write(chunk);remaining-=len(chunk)
        except Exception:
            if created and target.is_file():target.unlink()
            raise
    return {'saved':True,'path':str(target),'bytes':length}
def key(name):return hashlib.sha256(canonical(name).encode()).hexdigest()

def cached(name):
    legacy=hashlib.sha256(' '.join(str(name).lower().split()).encode()).hexdigest()
    for identifier in dict.fromkeys([key(name),legacy]):
        path=CACHE/(identifier+'.json')
        if not path.exists():continue
        saved=json.loads(path.read_text(encoding='utf-8'))
        photos=saved.get('pictures',[saved])
        # Older approvals did not distinguish a single milk pack from a case.
        if bulk_request(name) and not all(p.get('packageKind')=='case' for p in photos):continue
        return saved
    return None

REFERENCE_FIELDS=('source','sourcePage','sourceTitle','variantKey','isolated','memberQuery','matchWarning','packageKind','verifiedMatch','referenceKey','displayDetails','packageForm')

def action(route,data):
    name=str(data.get('name',''))[:240]
    if route=='library-search':return {'candidates':library.search(name),'summary':library.catalogue()['summary']}
    if route=='isolate':return isolate(data)
    if route=='search-wide':
        spec=group_spec(name);result=search_more_stores(spec['queries'][0] if spec['mode']=='variants' else name)
        if spec['mode']=='variants':result['candidates']=eligible_group_candidates(spec['queries'][0],result['candidates'])
        return result
    if route=='lookup-group':
        spec=group_spec(name)
        prior=None if data.get('refresh') else cached(name)
        refs_path=BASE/'reference-pictures.json'
        exact=matching_reference(name,json.loads(refs_path.read_text(encoding='utf-8'))) if refs_path.exists() else None
        if exact and exact.get('verifiedMatch') and (not prior or prior.get('identityRevision',0)<4):prior=None
        if prior and len(prior.get('pictures',[]))<spec['minimum']:prior=None
        if prior and prior.get('libraryRevision')==3 and prior.get('coverageReviewed'):
            return {'spec':spec,'pictures':prior['pictures'],'compositeGroup':bool(prior.get('compositeGroup')),'cached':True,'candidates':[]}
        records=json.loads((BASE/'reference-pictures.json').read_text(encoding='utf-8'))
        normal=' '.join(name.lower().split())
        picked=[]
        record=matching_reference(name,records)
        if record:picked=record.get('pictures') or [record]
        elif spec['mode']=='variants' and re.fullmatch(r'lifebuoy shampoo 370\s*ml',spec['queries'][0],re.I):
            picked=[r for k,r in records.items() if 'lifebuoy' in k and '370' in k and r.get('variantKey')]
        elif spec['mode']=='combined':
            for q in spec['queries']:
                record=matching_reference(q,records)
                if record:picked.append(dict(record,memberQuery=q))
        if picked:
            unique={r['file']:r for r in picked};pictures=[]
            for record in unique.values():
                pictures.append({**{k:record.get(k,'') for k in REFERENCE_FIELDS},'src':'data:image/png;base64,'+base64.b64encode((BASE/record['file']).read_bytes()).decode()})
            return {'spec':spec,'pictures':pictures,'cached':False,'reference':True,'candidates':[]}
        local=[]
        if spec['mode'] in ('single','sizes'):
            item=library.exact_photo(spec['queries'][0])
            if item:return {'spec':spec,'pictures':[item],'cached':False,'reference':True,'candidates':[]}
            local=library.search(spec['queries'][0])
        elif spec['mode']=='variants':
            local=eligible_group_candidates(spec['queries'][0],library.search(spec['queries'][0]))
        else:
            for q in spec['queries']:
                local.extend(dict(c,memberQuery=q) for c in library.search(q))
        if data.get('libraryOnly') or local:return {'spec':spec,'pictures':[],'cached':False,'candidates':local,'reference':bool(local)}
        spec=group_spec(name);prior=None if data.get('refresh') else cached(name)
        refs_path=BASE/'reference-pictures.json'
        exact=matching_reference(name,json.loads(refs_path.read_text(encoding='utf-8'))) if refs_path.exists() else None
        if exact and exact.get('verifiedMatch') and (not prior or prior.get('identityRevision',0)<4):prior=None
        if prior and prior.get('pictures') and prior.get('coverageReviewed') and prior.get('libraryRevision')==3:
            return {'spec':spec,'pictures':prior['pictures'],'compositeGroup':bool(prior.get('compositeGroup')),'cached':True,'candidates':[]}
        if spec['mode'] in ('single','sizes'):
            result=action('lookup',data);result['spec']=spec
            if result.get('picture'):result['pictures']=[result.pop('picture')]
            return result
        candidates=[];errors=[];pictures=[]
        for query in spec['queries']:
            if spec['mode']=='combined':
                result=action('lookup',{'name':query,'refresh':data.get('refresh',False)})
                if result.get('picture'):
                    pictures.append(dict(result['picture'],memberQuery=query));continue
                found=result.get('candidates',[]);errors+=result.get('errors',[])
            else:
                found=[]
                try:found=search_store(query)['candidates']
                except AppError as exc:errors.append(str(exc))
                if len(found)<2:
                    try:found+=search_daraz(query)
                    except AppError as exc:errors.append(str(exc))
                if len(found)<3:
                    extra=search_more_stores(query);found+=extra['candidates'];errors+=extra['errors']
            candidates.extend(dict(c,memberQuery=query) for c in eligible_group_candidates(query,found))
        return {'spec':spec,'pictures':pictures,'candidates':candidates[:24],'errors':errors,'cached':False}
    if route=='lookup':
        prior=None if data.get('refresh') else cached(name)
        refs_path=BASE/'reference-pictures.json'
        exact=matching_reference(name,json.loads(refs_path.read_text(encoding='utf-8'))) if refs_path.exists() else None
        if exact and exact.get('verifiedMatch') and (not prior or prior.get('identityRevision',0)<4):prior=None
        if prior:return {'picture':prior.get('pictures',[prior])[0],'cached':True,'candidates':[]}
        reference=BASE/'reference-pictures.json'
        if reference.exists():
            refs=json.loads(reference.read_text(encoding='utf-8'))
            record=matching_reference(name,refs)
            if record:
                raw=(BASE/record['file']).read_bytes()
                p={k:record.get(k,'') for k in REFERENCE_FIELDS}
                p['src']='data:image/png;base64,'+base64.b64encode(raw).decode()
                return {'picture':p,'cached':False,'reference':True,'candidates':[]}
        item=library.exact_photo(name)
        if item:return {'picture':item,'cached':False,'reference':True,'candidates':[]}
        saved=library.search(name)
        if saved:return {'candidates':saved,'cached':False,'reference':True}
        found=[];errors=[]
        try:found=search_store(name)['candidates']
        except AppError as exc:errors.append(str(exc))
        if not found or not found[0].get('autoEligible'):
            try:found+=search_daraz(name)
            except AppError as exc:errors.append(str(exc))
        if not any(c.get('autoEligible') for c in found):
            extra=search_more_stores(name);found+=extra['candidates'];errors+=extra['errors']
        found.sort(key=lambda x:x['score'],reverse=True)
        return {'candidates':found[:8],'errors':errors,'cached':False}
    if route=='fetch':
        url=str(data.get('url',''))[:4000]
        if url.startswith('library://'):return library.photo(url[len('library://'):])
        reference=BASE/'reference-pictures.json'
        if reference.exists():
            for record in json.loads(reference.read_text(encoding='utf-8')).values():
                if url and record.get('sourcePage')==url:
                    return {'src':'data:image/png;base64,'+base64.b64encode((BASE/record['file']).read_bytes()).decode(),**{k:record.get(k,'') for k in REFERENCE_FIELDS}}
        return remote_image(url) if data.get('direct') else product_picture(url)
    if route=='remember':
        if not name.strip():raise AppError('A product name is required.')
        supplied=data.get('pictures');group=supplied is not None
        supplied=supplied if group else [data.get('picture',{})]
        if not isinstance(supplied,list) or not 1<=len(supplied)<=24:raise AppError('Use between 1 and 24 product pictures.')
        allowed=[];total=0
        for picture in supplied:
            if not isinstance(picture,dict) or not re.fullmatch(r'data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+',picture.get('src','')):raise AppError('Unsupported picture.')
            if picture.get('needsIsolation'):raise AppError('Remove the advertising background before approving.')
            raw=base64.b64decode(picture['src'].split(',',1)[1],validate=True);total+=len(picture['src'])
            if len(raw)>12*1024*1024:raise AppError('Picture exceeds 12 MB.')
            if total>64*1024*1024:raise AppError('Image group exceeds 64 MB. Use smaller photos.')
            if not (raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff') or (raw[:4]==b'RIFF' and raw[8:12]==b'WEBP')):raise AppError('Invalid picture bytes.')
            if not picture.get('isolated'):
                image=Image.open(io.BytesIO(raw)).convert('RGBA')
                alpha=image.getchannel('A');w,h=image.size
                if not all(alpha.getpixel(pt)<20 for pt in ((0,0),(w-1,0),(0,h-1),(w-1,h-1))):
                    raise AppError('Remove the photo background, or trace the product outline before approving.')
            allowed.append({k:picture.get(k,'') for k in ('src',)+REFERENCE_FIELDS})
        if group:
            if len({p['src'] for p in allowed})!=len(allowed):raise AppError('Duplicate photo in the group. Add a different variant.')
            spec=group_spec(name)
            if spec['mode'] in ('single','sizes') and len(allowed)>1:raise AppError('Other variants were not requested. Use one representative pack.')
            if spec['mode']=='combined' and not data.get('compositeGroup') and any(q not in [p.get('memberQuery') for p in allowed] for q in spec['queries']):raise AppError('A named product is missing from the group.')
            if spec['mode']=='variants' and len(allowed)<spec['minimum'] and not data.get('compositeGroup'):raise AppError('Add the other variants, or mark a complete group photo.')
            allowed={'pictures':allowed,'coverageReviewed':True,'libraryRevision':3,'identityRevision':4,'compositeGroup':bool(data.get('compositeGroup'))}
        else:allowed=allowed[0]
        with LOCK:
            temp=CACHE/(key(name)+'.tmp');temp.write_text(json.dumps(allowed),encoding='utf-8');os.replace(temp,CACHE/(key(name)+'.json'))
        return {'saved':True}
    raise AppError('Unknown action.')
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def host_ok(self):return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}'
    def reply(self,status,body,mime='application/json'):
        if not isinstance(body,bytes):body=json.dumps(body).encode()
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('X-Content-Type-Options','nosniff');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        if not self.host_ok():return self.reply(403,{'error':'Open the local app.'})
        path=urllib.parse.unquote(urllib.parse.urlparse(self.path).path).lstrip('/')
        if not path or path=='index.html':
            text=(BASE/'index.html').read_text(encoding='utf-8').replace('<!-- bridge -->','<script>window.TOKEN='+json.dumps(TOKEN)+';window.SAVE_ROOT='+json.dumps(str(save_root()) if save_root() else None)+';</script>')
            return self.reply(200,text.encode(),'text/html; charset=utf-8')
        allowed=path in ('app.js','layout.js','validity.js','style.css','studio.css','crop.js','files.js','pako.min.js','catalog.json','product-rules.json','Your sample product list.xlsx','brand-logo.png','brand-footer.png') or bool(re.fullmatch(r'assets/t\d{3}(?:-thumb|-dates)?\.(?:png|jpg)',path))
        review=BASE/'Product and layout review'
        if review.is_dir():
            allowed=allowed or path in {'Product and layout review/'+f.name for f in review.iterdir() if f.is_file() and f.suffix.lower() in ('.html','.jpg','.png')}
        product_library=BASE/'Product library'
        if product_library.is_dir():
            allowed=allowed or path in ('Product library/Browse products.html','Product library/catalogue.json','Product library/catalogue-data.js','Product library/Product catalogue.csv','Product library/library.js','Product library/Layout samples.html')
            allowed=allowed or bool(re.fullmatch(r'Product library/Library sample 0[1-8]\.png',path))
            allowed=allowed or path in {'Product library/'+r['preview'] for r in library.catalogue()['photos']}
            allowed=allowed or path in {'Product library/'+r['file'] for r in library.catalogue()['photos']}
        if not allowed or not (BASE/path).is_file():return self.reply(404,{'error':'Not found.'})
        self.reply(200,(BASE/path).read_bytes(),mimetypes.guess_type(path)[0] or 'application/octet-stream')
    def do_POST(self):
        if not self.host_ok() or self.headers.get('Origin')!=f'http://127.0.0.1:{self.server.server_port}' or not hmac.compare_digest(self.headers.get('X-Askari-Token',''),TOKEN):return self.reply(403,{'error':'Open the local app.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if self.path=='/api/save-output':return self.reply(200,save_output(self,length))
            if not 0<length<=70*1024*1024:raise AppError('Request too large.')
            data=json.loads(self.rfile.read(length))
            if not isinstance(data,dict):raise AppError('Invalid request.')
            if not self.path.startswith('/api/'):raise AppError('Unknown action.')
            self.reply(200,action(self.path[5:],data))
        except (AppError,ValueError,TypeError,KeyError) as exc:self.reply(400,{'error':str(exc)[:500]})
        except Exception:self.reply(500,{'error':'Could not complete this step. Try again or add a local picture.'})
if __name__=='__main__':
    if '--no-browser' not in sys.argv:
        try:
            prior=(BASE/'Last app address.txt').read_text(encoding='utf-8')
            if re.fullmatch(r'http://127\.0\.0\.1:\d+/',prior):
                with urllib.request.urlopen(prior,timeout=2) as check:
                    if b'<title>Askari Batch Studio</title>' in check.read(10000):
                        webbrowser.open(prior);raise SystemExit(0)
        except (OSError,ValueError):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
    url=f'http://127.0.0.1:{server.server_port}/'
    print(url,flush=True)
    (BASE/'Last app address.txt').write_text(url,encoding='utf-8')
    if '--no-browser' not in sys.argv:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
