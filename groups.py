"""Product groups retain the named range and pack size, never invent variants."""
import re,json
from pathlib import Path
from identity import canonical
from pictures import pack_size, pack_count

def group_spec(name):
    rules=Path(__file__).resolve().parent/'product-rules.json'
    if rules.exists():
        for rule in json.loads(rules.read_text(encoding='utf-8')):
            if canonical(name) in [canonical(a) for a in rule['aliases']]:return dict(rule['groupSpec'])
    text=str(name).strip()
    mode='sizes' if re.search(r'\ball\s+sizes\b',text,re.I) else 'variants' if re.search(r'\ball\s+vari(?:ants|ents|eties)\b',text,re.I) else 'single'
    base=re.sub(r'\ball\s+(?:sizes|vari(?:ants|ents|eties))\b','',text,flags=re.I).strip()
    base=re.sub(r'\s+',' ',base)
    if mode!='single':return {'mode':mode,'queries':[base],'minimum':1 if mode=='sizes' else 2,'coverage_review':True}
    # Brand names containing & are not two separate products.
    if re.search(r'head\s*(?:&|and)\s*shoulders|johnson\s*(?:&|and)\s*johnson|cookies?\s*(?:&|and)\s*cream|cream\s*(?:&|and)\s*choc',text,re.I):return {'mode':'single','queries':[text],'minimum':1,'coverage_review':False}
    safe=text
    parts=re.split(r'\s*&\s*|\s+and\s+',safe,flags=re.I)
    if len(parts)>1 and len(parts)<=12 and safe==text:
        brand=text.split()[0]
        size=re.search(r'\b\d+(?:\.\d+)?\s*(?:kg|gm|g|ml|litres?|liters?|ltr|l|pcs)\b',text,re.I)
        queries=[]
        for i,part in enumerate(parts):
            query=part.strip()
            if not query:continue
            if i and brand.lower() not in query.lower().split():query=brand+' '+query
            if size and not pack_size(query):query+=' '+size.group()
            queries.append(query)
        if len(queries)>1:return {'mode':'combined','queries':queries,'minimum':len(queries),'coverage_review':True}
    return {'mode':'single','queries':[text],'minimum':1,'coverage_review':False}

def eligible_group_candidates(query,candidates):
    size=pack_size(query);brand=query.lower().split()[0] if query.split() else ''
    required=set(re.findall(r'[a-z]+',query.lower()))-{'all','variants','varients','varieties','sizes','ml','litre','liter','litres','liters','ltr','kg','gm','g','l','pcs'}
    unique={}
    for c in candidates:
        title=c.get('name','');tokens=set(re.findall(r'[a-z]+',title.lower()))
        if brand not in tokens or not required.issubset(tokens):continue
        if size and pack_size(title)!=size:continue
        if pack_count(query)!=pack_count(title):continue
        identity=variant_identity(title)
        if identity not in unique or len(title)>len(unique[identity]['name']):unique[identity]=dict(c,autoEligible=False,groupQuery=query,variantKey=identity)
    return list(unique.values())

def variant_identity(title):
    text=re.sub(r'[^a-z0-9]+',' ',str(title).lower()).strip()
    if 'lifebuoy' in text and 'shampoo' in text:
        for variant,keywords in [('naturally-long',['naturally long','amla']),('naturally-strong',['naturally strong','onion']),('naturally-silky',['naturally silky','methi']),('anti-dandruff',['anti dandruff','egg yogurt']),('silky-soft',['silky soft','mustard']),('strong-thick',['strong thick','almond']),('herbal-strong',['herbal strong','aloe vera'])]:
            if any(k in text for k in keywords):return 'lifebuoy-shampoo:'+variant+':'+str(pack_size(title))
    return text
