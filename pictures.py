import base64, hmac, http.server, ipaddress, json, os, re, secrets, socket, sys, threading, time, urllib.error, urllib.parse, urllib.request, webbrowser, hashlib, mimetypes
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from html import unescape
from pathlib import Path
from identity import identity_matches, verified_pack_reference
BASE=Path(__file__).resolve().parent
TOKEN=secrets.token_urlsafe(32)
class AppError(Exception):pass

class StorePage(HTMLParser):
    def __init__(self):
        super().__init__();self.links=[];self.pictures=[];self.gallery=[];self.anchor=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='a' and a.get('href','').startswith('https://www.naheed.pk/'):
            self.anchor=[a['href'],'']
        if tag=='img' and a.get('itemprop')=='image' and a.get('src'):
            self.pictures.append(a['src'])
        if tag=='a' and 'mt-thumb-switcher' in a.get('class','') and a.get('href','').startswith('https://'):
            self.gallery.append(a['href'])
    def handle_data(self,data):
        if self.anchor is not None:self.anchor[1]+=data
    def handle_endtag(self,tag):
        if tag=='a' and self.anchor is not None:
            url,name=self.anchor;self.anchor=None
            if name.strip():self.links.append({'url':url,'name':' '.join(name.split())})

def store_page(url):
    validate_remote(url)
    if urllib.parse.urlparse(url).hostname!='www.naheed.pk':raise AppError('Use a Naheed product-page link or a direct image link.')
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'AskariStudio/1.0'})
        with urllib.request.build_opener(PublicRedirect()).open(req,timeout=35) as r:body=r.read(32*1024*1024+1)
    except (urllib.error.URLError,TimeoutError):raise AppError('Naheed could not be reached. Use Search in browser, or add a picture from your folder.') from None
    if len(body)>32*1024*1024:raise AppError('The store page is too large. Use the browser search instead.')
    page=StorePage();page.feed(body.decode('utf-8','replace'));return page

STORE_LOCK=threading.Lock()
def pack_size(name):
    found=re.search(r'(\d+(?:\.\d+)?)\s*(kg|gm|g|ml|litres?|liters?|litrs?|ltrs?|ltr|l|pcs)\b',name,re.I)
    if not found:return None
    value,unit=found.groups();value=float(value);unit=unit.lower()
    if unit=='kg':return ('g',round(value*1000,3))
    if unit in ('g','gm'):return ('g',value)
    if unit=='ml':return ('ml',value)
    if unit=='pcs':return ('pcs',value)
    return ('ml',round(value*1000,3))

def pack_count(name):
    name=str(name).lower()
    carton=re.search(r'\b(\d+)\s*[- ]?\s*(?:piece|pcs)\s*(?:carton|case|pack)\b',name)
    if carton:return int(carton.group(1))
    multipack=re.search(r'\b(\d+)\s*(?:litres?|liters?|ltr|l|kg)?\s*[x*]\s*(\d+)\b',name)
    if multipack:return int(multipack.group(2))
    found=re.search(r'pack\s*(?:of\s*)?(\d+)\b|\b(\d+)\s*[- ]?\s*pack\b|\b(\d+)\s*[x*]\s*\d',name)
    return int(next(v for v in found.groups() if v)) if found else 1

def rank_pictures(name,entries):
    def tokens(text):
        text=re.sub(r'(\d+(?:\.\d+)?)\s*(kg|gm|g|ml|litres?|liters?|ltr|l|pcs)\b',' ',text.lower())
        aliases={'surf':'detergent','revelon':'revlon','corton':'carton','crspy':'crispy','varients':'variants'}
        return {aliases.get(t,t) for t in re.findall(r'[a-z]+',text)}-{'and','the','all','price','product','rs','pet'}
    query=tokens(str(name)[:200]);size=pack_size(name)
    if not query:return []
    brand=re.findall(r'[a-z]+',name.lower())[0]
    brand={'revelon':'revlon'}.get(brand,brand)
    ambiguous=bool(re.search(r'&|\ball\s+(?:sizes|vari[ae]nts)|\b(?:box|carton|corton|bundle)\b|\d\s*(?:in|\*)\s*\d',name,re.I))
    ranked=[]
    for entry in entries:
        if not identity_matches(name,entry['name'],entry):continue
        candidate=tokens(entry['name']);overlap=query&candidate;candidate_size=pack_size(entry['name'])
        score=len(overlap)/len(query)-.015*len(candidate-query)
        # Formula stage and shade numbers distinguish otherwise similar SKUs.
        def codes(text):return set(re.findall(r'\b\d+\b',re.sub(r'\d+(?:\.\d+)?\s*(?:kg|gm|g|ml|litres?|liters?|ltr|l|pcs)\b',' ',text.lower())))
        code_ok=codes(name).issubset(codes(entry['name']))
        size_ok=size is None or size==candidate_size
        if size and not size_ok:score-=.6
        elif size:score+=.08
        if brand not in candidate:score-=.5
        if overlap and score>.12:
            count_ok=pack_count(name)==pack_count(entry['name'])
            if not count_ok:score-=.35
            reason='Formula stage or product number differs' if not code_ok else 'Pack size differs' if not size_ok else 'Bundle count differs' if not count_ok else 'Choose a variant or bundle' if ambiguous else 'Check product and variant'
            ranked.append({**entry,'score':round(score,3),'autoEligible':brand in candidate and size_ok and count_ok and code_ok and len(overlap)/len(query)>=.85 and not ambiguous and not verified_pack_reference(name),'reviewReason':reason})
    ranked.sort(key=lambda e:e['score'],reverse=True)
    return ranked[:10]

def search_store(name):
    cache=BASE/'naheed-picture-index.json'
    with STORE_LOCK:
        entries=None
        if cache.exists():
            try:entries=json.loads(cache.read_text(encoding='utf-8'))
            except (ValueError,OSError):pass
        if entries is None:
            page=store_page('https://www.naheed.pk/sitemap')
            entries=list({e['url']:e for e in page.links}.values())
            cache.write_text(json.dumps(entries),encoding='utf-8')
    return {'candidates':rank_pictures(str(name),[{**e,'store':'Naheed'} for e in entries]),'message':'Choose the exact pack. Prices will still come from Excel.'}

def public_document(url):
    validate_remote(url)
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 AskariStudio/1.0'})
        with urllib.request.build_opener(PublicRedirect()).open(req,timeout=25) as response:body=response.read(16*1024*1024+1)
    except (urllib.error.URLError,TimeoutError):raise AppError('This website could not be read. Use its browser search or a direct picture link.') from None
    if len(body)>16*1024*1024:raise AppError('The product page is too large.')
    return body.decode('utf-8','replace')

class ProductMetadata(HTMLParser):
    def __init__(self):
        super().__init__();self.meta={};self.structured=[];self.script=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='meta':self.meta[a.get('property') or a.get('name','')]=a.get('content','')
        if tag=='script' and a.get('type','').lower()=='application/ld+json':self.script=''
    def handle_data(self,text):
        if self.script is not None:self.script+=text
    def handle_endtag(self,tag):
        if tag=='script' and self.script is not None:
            try:self.structured.append(json.loads(self.script))
            except ValueError:pass
            self.script=None

def product_picture(url):
    url=str(url)[:4000]
    if urllib.parse.urlparse(url).hostname=='www.naheed.pk':return store_image(url)
    parser=ProductMetadata();parser.feed(public_document(url));found=[]
    def visit(value,depth=0):
        if depth>12:return
        if isinstance(value,list):
            for item in value:visit(item,depth+1)
        elif isinstance(value,dict):
            types=value.get('@type',[]);types=[types] if isinstance(types,str) else types
            if 'Product' in types:
                picture=value.get('image',[]);picture=[picture] if not isinstance(picture,list) else picture
                for item in picture:
                    link=item.get('url') or item.get('contentUrl') if isinstance(item,dict) else item
                    if isinstance(link,str):found.append((link,str(value.get('name',''))))
            visit(value.get('@graph',[]),depth+1)
    for value in parser.structured:visit(value)
    if not found and parser.meta.get('og:type','').lower() in ('product','og:product'):
        picture=parser.meta.get('og:image:secure_url') or parser.meta.get('og:image')
        if picture:found.append((picture,parser.meta.get('og:title','')))
    found=[(urllib.parse.urljoin(url,unescape(link)),title) for link,title in found if 'placeholder' not in link.lower() and 'logo' not in link.lower()]
    if not found:raise AppError('No public product picture was found. Use a direct image link or the website in your browser.')
    last_error=None
    for link,title in found[:3]:
        try:
            result=remote_image(link);result.update(sourcePage=url,sourceTitle=title[:240]);return result
        except AppError as error:last_error=error
    raise last_error or AppError('The product picture could not be fetched.')

def search_daraz(name):
    url='https://www.daraz.pk/catalog/?'+urllib.parse.urlencode({'q':str(name)[:200],'ajax':'true'})
    try:data=json.loads(public_document(url))
    except ValueError:raise AppError('Daraz did not return public search results. Use Daraz browser search.') from None
    entries=[]
    for item in data.get('mods',{}).get('listItems',[])[:60]:
        link=urllib.parse.urljoin('https://www.daraz.pk',str(item.get('itemUrl','')))
        if item.get('name') and urllib.parse.urlparse(link).hostname=='www.daraz.pk' and '/products/' in urllib.parse.urlparse(link).path:
            entries.append({'name':str(item['name'])[:240],'url':link,'store':'Daraz'})
    return rank_pictures(str(name),entries)

def search_more_stores(name):
    """Public retailer catalog searches; no API key or paid search service."""
    stores=[('Al-Fatah','alfatah.pk'),('Shaheen','shaheenonline.com.pk'),("Nazar Jan's",'nazarjanssupermarket.com')]
    def find(store):
        label,host=store
        # Search a concise name, then rank exact sizes and pack counts locally.
        query=re.sub(r'\ball\s+(?:sizes|vari(?:ants|ents|eties))\b','',str(name),flags=re.I).strip()
        url='https://'+host+'/search/suggest.json?'+urllib.parse.urlencode({'q':query,'resources[type]':'product','resources[limit]':10})
        try:
            data=json.loads(public_document(url));entries=[]
            for p in data.get('resources',{}).get('results',{}).get('products',[])[:10]:
                link=urllib.parse.urljoin('https://'+host,str(p.get('url','')))
                parsed=urllib.parse.urlparse(link)
                if p.get('title') and parsed.hostname==host and parsed.path.startswith('/products/'):
                    entries.append({'name':str(p['title'])[:240],'url':urllib.parse.urlunparse(parsed._replace(query='',fragment='')),'store':label})
            return rank_pictures(str(name),entries),None
        except (AppError,ValueError,TypeError):return [],label+' search unavailable; try a product link.'
    with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(find,stores))
    candidates=[c for group,_ in results for c in group];candidates.sort(key=lambda c:c['score'],reverse=True)
    return {'candidates':list({c['url']:c for c in candidates}.values())[:24],'errors':[error for _,error in results if error]}

def search_pictures(name,source='both'):
    if not str(name).strip():raise AppError('Type a product name first.')
    if source not in ('both','naheed','daraz'):raise AppError('Choose Naheed, Daraz, or both.')
    candidates=[];errors=[]
    if source in ('both','naheed'):
        try:candidates+=search_store(str(name))['candidates']
        except AppError as error:errors.append('Naheed: '+str(error))
    if source in ('both','daraz'):
        try:candidates+=search_daraz(str(name))
        except AppError as error:errors.append('Daraz: '+str(error))
    candidates.sort(key=lambda e:(e['score'],e.get('store')=='Naheed'),reverse=True)
    candidates=list({e['url']:e for e in candidates}.values())[:12]
    return {'candidates':candidates,'errors':errors,'message':'Suggested pictures need pack review. Prices remain from Excel.'}

def store_image(url):
    page=store_page(str(url)[:4000])
    pictures=list(dict.fromkeys(u for u in [*page.gallery,*page.pictures] if 'placeholder' not in u))
    if not pictures:raise AppError('No product picture was found on that page. Use a direct picture link or your image folder.')
    def quality_hint(u):
        filename=urllib.parse.urlparse(u).path.rsplit('/',1)[-1].lower()
        if any(word in filename for word in ('power_image','power-image','benefit','infographic','banner')):return 4
        if re.search(r'[-_]1\.(?:jpg|png|webp)$',filename):return 0
        if re.search(r'[-_][23456789]\.(?:jpg|png|webp)$',filename):return 2
        return 1
    pictures.sort(key=quality_hint)
    result=remote_image(pictures[0]);result['sourcePage']=url;result['gallery']=pictures;return result
def validate_remote(url):
    parsed=urllib.parse.urlparse(url)
    if parsed.scheme!='https' or parsed.username or parsed.password or parsed.port not in (None,443) or not parsed.hostname:raise AppError('Use a direct HTTPS PNG, JPG or WebP image link.')
    try:addresses=socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
    except OSError:raise AppError('Image website could not be reached.') from None
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise AppError('The image address must be a public website.')
class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,request,fp,code,msg,headers,newurl):
        validate_remote(newurl)
        return super().redirect_request(request,fp,code,msg,headers,newurl)

def remote_image(url):
    url=str(url)[:4000];validate_remote(url)
    try:
        with urllib.request.build_opener(PublicRedirect()).open(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 AskariStudio'}),timeout=25) as response:image=response.read(12*1024*1024+1)
    except (urllib.error.URLError,TimeoutError):raise AppError('Website blocked the picture. Download it in your browser and add it to your image folder.') from None
    if len(image)>12*1024*1024:raise AppError('Image exceeds 12 MB.')
    if image.startswith(b'\x89PNG\r\n\x1a\n'):mime,extension='image/png','png'
    elif image.startswith(b'\xff\xd8\xff'):mime,extension='image/jpeg','jpg'
    elif image[:4]==b'RIFF' and image[8:12]==b'WEBP':mime,extension='image/webp','webp'
    else:raise AppError('That link is not a direct PNG, JPG or WebP picture.')
    return {'src':'data:'+mime+';base64,'+base64.b64encode(image).decode(),'extension':extension,'source':url}
