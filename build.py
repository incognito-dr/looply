# python3 build.py -> index.html (un solo archivo: fuentes y logos dentro)
import base64, pathlib, urllib.parse, re
H=pathlib.Path(__file__).parent; A=H.parent/'arde-presentacion'/'assets'
b=lambda f: base64.b64encode((H/f).read_bytes()).decode()
svg=lambda n:(A/f'{n}.clean.svg').read_text().replace('<svg ','<svg aria-hidden="true" style="width:100%;height:auto" ',1)
fav=(A/'icon.clean.svg').read_text().replace('currentColor','#EC0529')
ic=(A/'icon.clean.svg').read_text()
rep={'ICON_D':re.search(r' d="([^"]+)"',ic).group(1),'ICON_VB':','.join(re.search(r'viewBox="([^"]+)"',ic).group(1).split()),'F_TERM':b('Termina-Demi.otf'),'GRAIN':b('grain.png'),
     'WM':svg('wordmark'),'SIG':svg('wordmark_signature'),'ICON':svg('icon'),'FAVICON':urllib.parse.quote(fav)}
s=(H/'index.src.html').read_text()
for k,v in rep.items():
    if '{{'+k+'}}' in s: s=s.replace('{{'+k+'}}',v)
assert '{{' not in s; (H/'index.html').write_text(s); print('ok',len(s)//1024,'KB')
