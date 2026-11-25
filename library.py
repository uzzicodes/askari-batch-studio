"""Offline, provenance-preserving product photo catalogue. No network calls."""
import base64,json,re
from functools import lru_cache
from pathlib import Path
from pictures import pack_size,pack_count,AppError
from identity import canonical,identity_matches,bulk_request
BASE=Path(__file__).resolve().parent
def normal(text):return re.sub(r'[^a-z0-9]+',' ',str(text).lower()).strip()
@lru_cache(maxsize=1)
def catalogue():
 path=BASE/'Product library/catalogue.json'
 return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'summary':{},'photos':[]}
def photo(identifier):
 r=next((r for r in catalogue()['photos'] if r['id']==identifier),None)
 if not r or not r['usable']:raise AppError('This image is a reference group or still needs cleanup. Choose a reusable cutout.')
 origin=r['origins'][0]
 warning=r['notes']
 if r['status']=='Small original':warning=('Small original: '+str(r['nativePixels'][0])+' × '+str(r['nativePixels'][1])+' saved pixels. '+warning).strip()
 return {'src':'data:image/png;base64,'+base64.b64encode((BASE/'Product library'/r['file']).read_bytes()).decode(),'source':origin['source'],'sourcePage':'library://'+r['id'],'sourceTitle':r['name'],'isolated':True,'matchWarning':warning,'libraryId':r['id'],'packageKind':r.get('packageKind','individual')}
def search(name):
 q=normal(name);query=set(q.split());result=[]
 if not query:return []
 stop={'all','sizes','variants','varients','varieties','ml','kg','g','gm','l','litre','litres','liter','liters','ltr','pcs','pack','packs','box','bottle','pouch','tin','and','of','the'}
 required={t for t in query if t not in stop and not t.isdigit()};brand=next(iter(q.split()),'')
 for r in catalogue()['photos']:
  if not r['usable']:continue
  aliases=[normal(a) for a in r['aliases']];tokens=set(normal(r['name']).split());overlap=required&tokens
  exact_alias=canonical(name) in [canonical(a) for a in r['aliases']]
  if not identity_matches(name,r['name']+' '+r.get('historicalPackLabel',''),r) and not exact_alias:continue
  if bulk_request(name) and r.get('packageKind')!='case' and not __import__('identity').bulk_candidate(r['name'],r):continue
  if not overlap or (brand not in tokens and not any(a.startswith(brand+' ') for a in aliases)):continue
  # Pack size is a hard constraint when supplied; photos without known units
  # cannot be substituted for a particular requested size.
  size=pack_size(name)
  if size and pack_size(r['name'])!=size:continue
  if pack_count(name)>1 and pack_count(name)!=pack_count(r['name']):continue
  # Formula stage is part of the SKU, even when almost all words match.
  stage_text=re.sub(r'\d+(?:\.\d+)?\s*(?:kg|gm|g|ml|litres?|liters?|ltr|l|pcs)\b',' ',str(name).lower())
  numbers=set(re.findall(r'\b\d+\b',stage_text))
  if numbers and not numbers.issubset(set(re.findall(r'\b\d+\b',r['name']))):continue
  score=len(overlap)/max(len(required),1)
  if score<.5:continue
  exact=exact_alias
  result.append({'name':r['name'],'url':'library://'+r['id'],'score':round(score+(2 if exact else 0),3),'autoEligible':False,'source':'Saved product library','store':'Saved library','reviewReason':r['status']+' • '+str(r['nativePixels'][0])+' × '+str(r['nativePixels'][1])+' px. Check the exact pack.','libraryId':r['id'],'exact':exact,'nativePixels':r['nativePixels']})
 result.sort(key=lambda r:(r['score'],max(r['nativePixels'])),reverse=True)
 return result[:24]
def exact_photo(name):
 matches=[r for r in search(name) if r['exact']]
 # Two packs with the same incomplete name are a choice, not a guessed SKU.
 if len(matches)==1:return photo(matches[0]['libraryId'])
 return None
