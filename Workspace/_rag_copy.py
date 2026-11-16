import hashlib, pathlib, shutil
ROOT = pathlib.Path(r'd:\Data\QoderWorkArea\CardVideoMethod')
main = ROOT/'RAG/portraits/figure-symmetric-cartographer'
sub  = main/'portrait-fixed-variables'
sub.mkdir(parents=True, exist_ok=True)
def h(p): return hashlib.sha256(p.read_bytes()).hexdigest()[:12].upper()
cards = [(ROOT/'Log/Circle8/figure-symmetric-cartographer.md', main/'card.md'),
         (ROOT/'Log/Circle8/portrait-fixed-variables.md', sub/'card.md')]
for src, dst in cards:
    shutil.copy2(src, dst); print('CARD', dst.relative_to(ROOT), h(src), '->', h(dst), 'OK' if h(src)==h(dst) else 'MISMATCH')
prompt = ROOT/'Log/Circle8/output/v3-fixed10/prompt.txt'
for d in (main, sub):
    shutil.copy2(prompt, d/'prompt.txt'); print('PROMPT', (d/'prompt.txt').relative_to(ROOT), len(prompt.read_text(encoding='utf-8')), '字')
for name, tag in (('01-pass-880x1184.png','portrait-01.png'), ('02-pass-1086x1448.png','portrait-07.png')):
    src = ROOT/'Log/Circle8/output/v3-fixed10'/tag
    for d in (main, sub):
        shutil.copy2(src, d/name)
    print('IMG', name, '<-', tag, src.stat().st_size//1024, 'K')
