from PIL import Image
import pathlib, json
d = pathlib.Path(r'd:\Data\QoderWorkArea\CardVideoMethod\Log\Circle8\output\v3-fixed10')
for n in ('portrait-01.png','portrait-02.png','portrait-07.png'):
    im = Image.open(d/n)
    v = (getattr(im,'text',{}) or {}).get('AIGC','')
    print(n, im.size, 'len', len(v))
    print(v[:1200])
    print('-'*60)
