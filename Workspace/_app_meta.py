import json, pathlib, subprocess, sys
ROOT = pathlib.Path(r'd:\Data\QoderWorkArea\CardVideoMethod')
sys.path.insert(0, str(ROOT/'Skill/RHclaw/runninghub/scripts'))
from runninghub import require_api_key
key = require_api_key(None)
url = f'https://www.runninghub.cn/api/webapp/apiCallDemo?apiKey={key}&webappId=2046794551444119554'
d = json.loads(subprocess.run(['curl','-s','-S','--fail-with-body','--max-time','30',url],capture_output=True,text=True).stdout)['data']
for k in ('webappName','description','tags','statisticsInfo','accessEncrypted','covers'):
    print(k, '=', json.dumps(d.get(k), ensure_ascii=False)[:600])
