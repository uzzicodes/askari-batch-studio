"""Small, bundled CPU-only product matting. Original product pixels are retained."""
import base64, io, threading
from pathlib import Path
from PIL import Image, ImageChops
import numpy as np
import onnxruntime as ort

_session = None
_lock = threading.Lock()

def cutout(image):
    global _session
    rgba = image.convert('RGBA')
    rgb = rgba.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS)
    arr = np.asarray(rgb, dtype=np.float32)
    if float(arr.reshape(-1,3).std(axis=0).max()) < .8:
        raise ValueError('No visible product found in this photo.')
    arr /= max(float(arr.max()), 1.0)
    arr = (arr - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
    tensor = arr.transpose(2, 0, 1)[None]
    with _lock:
        if _session is None:
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            _session = ort.InferenceSession(str(Path(__file__).parent/'models/u2netp.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
        mask = _session.run(None, {_session.get_inputs()[0].name: tensor})[0][0, 0]
    lo, hi = float(mask.min()), float(mask.max())
    if hi - lo < .01:
        raise ValueError('Could not separate this product. Use a closer product photo or the cutout tool.')
    mask = np.clip(((mask-lo)/(hi-lo)-.06)/.88, 0, 1)
    alpha = Image.fromarray((mask*255).astype('uint8')).resize(rgba.size, Image.Resampling.LANCZOS)
    alpha = ImageChops.multiply(alpha, rgba.getchannel('A'))
    rgba.putalpha(alpha)
    if not alpha.getbbox():
        raise ValueError('No product found. Use a closer product photo.')
    return rgba

def isolate(data):
    src = data.get('src', '')
    if not src.startswith(('data:image/png;base64,','data:image/jpeg;base64,','data:image/webp;base64,')):
        raise ValueError('Use a PNG, JPG or WebP product photo.')
    raw = base64.b64decode(src.split(',',1)[1], validate=True)
    if len(raw)>12*1024*1024:
        raise ValueError('Photo exceeds 12 MB.')
    image = Image.open(io.BytesIO(raw))
    if image.width*image.height>18_000_000:
        raise ValueError('Photo is too large. Use a smaller product photo.')
    result = cutout(image)
    out = io.BytesIO();result.save(out, 'PNG')
    return {'src':'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode(), 'processing':'Background removed locally — review product edges', 'isolated':False}
