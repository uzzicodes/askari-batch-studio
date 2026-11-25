"""Conservative product identity and case/individual-pack matching."""
import re

WORD_ALIASES={'corton':'carton','cartoon':'carton','oreao':'oreo','crspy':'crispy','chocolato':'chocolatto','choclate':'chocolate','revelon':'revlon','surf':'detergent','pattie':'patties','kebab':'kabab'}
def canonical(text):
    text=str(text or '').lower().replace('&',' and ')
    text=re.sub(r'(\d+(?:\.\d+)?)\s*(litres?|liters?|litrs?|ltrs?|ltr|l)\b',lambda m:format(float(m[1])*1000,'g')+' ml',text)
    text=re.sub(r'(\d+(?:\.\d+)?)\s*kg\b',lambda m:format(float(m[1])*1000,'g')+' g',text)
    text=re.sub(r'(\d+(?:\.\d+)?)\s*(gm|g|ml)\b',r'\1 \2',text)
    words=re.findall(r'[a-z]+|\d+(?:\.\d+)?',text)
    return ' '.join(WORD_ALIASES.get(w,'g' if w=='gm' else w) for w in words)

def bulk_request(text):return bool(re.search(r'\b(?:carton|corton|cartoon|case)\b|\bfull\s+box\b',str(text),re.I))

def bulk_candidate(title,metadata=None):
    metadata=metadata or {}
    if metadata.get('packageKind')=='case':return True
    text=str(title).lower()
    if metadata.get('packageKind') in ('individual','display_box'):return False
    return bool(re.search(r'\b(?:case|outer carton|outer box|full carton|full box)\b|\b\d+(?:\.\d+)?\s*(?:ml|litres?|liters?|litrs?|ltrs?|ltr|l)\s*[x*]\s*(?:[2-9]|[1-9]\d+)\b|\b(?:[2-9]|[1-9]\d+)\s*tetra\s*packs\b',text))

def verified_pack_reference(name):
    text=canonical(name);tokens=set(text.split())
    if bulk_request(name) or 'dawn' not in tokens:return None
    if {'burger','patties','992','g'}.issubset(tokens):return 'verified-book1-14'
    if {'seekh','kabab','540','g'}.issubset(tokens):return 'verified-book1-15'
    if {'nuggets','1000','g'}.issubset(tokens):return 'verified-book1-16'
    return None

def identity_matches(query,title,metadata=None):
    metadata=metadata or {};q=canonical(query).split();t=set(canonical(title).split())
    words=[w for w in q if w.isalpha() and w not in {'al','the','and','all','variants','varients','varieties','sizes','rs','ml','g','pcs','box','carton','case','pack','packs','full'}]
    if not words:return False
    anchor=words[0]
    if anchor not in t:return False
    # Generic prefixes such as "Al" cannot stand in for the actual brand Rafqas.
    essential={'ghee','desi','milk','shampoo','tea','danedar','nuggets','patties','kabab','detergent','croissant','chocolatto','crispy','cocomo'}
    if not (set(words)&essential).issubset(t):return False
    if len(set(words)&t)/len(set(words))<.65:return False
    # A single milk pack and an outer shipping case are different products.
    # Biscuit display boxes and nuggets containing 45 pieces are not milk cases.
    if bulk_request(query) and not bulk_candidate(title,metadata):return False
    if verified_pack_reference(query) and (metadata.get('packageForm') in ('box','case') or re.search(r'\b(?:box|boxed|carton|corton|case)\b',str(title),re.I)):return False
    if not bulk_request(query) and bulk_candidate(title,metadata):return False
    return True

def matching_reference(name,records):
    wanted=canonical(name)
    for alias,record in sorted(records.items(),key=lambda item:bool(item[1].get('verifiedMatch')),reverse=True):
        if canonical(alias)==wanted:
            if bulk_request(name) and record.get('packageKind')!='case':continue
            return record
    identifier=verified_pack_reference(name)
    if identifier:
        return next((r for r in records.values() if r.get('verifiedMatch') and r.get('referenceKey')==identifier),None)
    return None
