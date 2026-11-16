import json, pathlib, sys
ROOT = pathlib.Path(r'd:\Data\QoderWorkArea\CardVideoMethod')
sys.path.insert(0, str(ROOT/'Skill/RHclaw/runninghub/scripts'))
from runninghub import require_api_key, poll_task
key = require_api_key(None)
for tid in ('2122216128033030146',):
    f = poll_task(key, tid)
    for r in f.get('results') or []:
        print(r.get('url'))
