"""Direct-run a workflow JSON via /task/openapi/create `workflow` field (no workflowId).

Usage: python run_workflow_direct.py <wf.json> <out.mp4> [--nodes nodeId:field=value ...]
Prints point balance before/after, taskId, and downloads result.
"""
import sys, json, os, time, urllib.request
sys.path.insert(0, r"F:\AgentWorkArea\WorkBuddy\CardStudio\Skill\hub\generation\runninghub\scripts")
import rh_credential

KEY = rh_credential.load_key()
BASE = "https://www.runninghub.cn"


def post(path, payload, timeout=60):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def remain_point():
    d = post("/uc/openapi/accountStatus", {"apikey": KEY})
    return float(d["data"]["remainPoint"])


def main():
    wf_path, out_path = sys.argv[1], sys.argv[2]
    overrides = {}
    wf_id = "1904136902449209346"
    rest = sys.argv[3:]
    if rest and rest[0] == "--wfid":
        wf_id = rest[1]
        rest = rest[2:]
    if rest and rest[0] == "--nodes":
        for item in rest[1:]:
            nid, kv = item.split(":", 1)
            k, v = kv.split("=", 1)
            overrides.setdefault(nid, {})[k] = v

    with open(wf_path, "r", encoding="utf-8") as f:
        graph = json.load(f)

    node_info = []
    for nid, fields in overrides.items():
        for k, v in fields.items():
            node_info.append({"nodeId": str(nid), "fieldName": k, "fieldValue": v})

    before = remain_point()
    print(f"remainPoint before = {before}")

    payload = {"apiKey": KEY, "workflowId": wf_id,
               "workflow": json.dumps(graph, ensure_ascii=False), "nodeInfoList": node_info}
    res = post("/task/openapi/create", payload)
    print("submit:", json.dumps(res, ensure_ascii=False)[:400])
    if res.get("code") != 0:
        print("SUBMIT_FAILED")
        return 1
    task_id = res["data"]["taskId"]
    print("taskId:", task_id)

    t0 = time.time()
    while True:
        q = post("/task/openapi/outputs", {"apiKey": KEY, "taskId": task_id})
        code = q.get("code")
        if code == 0 and q.get("data"):
            outs = q["data"]
            print("done in", int(time.time() - t0), "s")
            for o in outs:
                print("fileUrl:", o.get("fileUrl"))
            url = outs[0].get("fileUrl")
            if url:
                with urllib.request.urlopen(url, timeout=300) as r, open(out_path, "wb") as f:
                    f.write(r.read())
                print("saved", out_path, os.path.getsize(out_path), "bytes")
            break
        if code == 805:
            print("FAILED:", json.dumps(q, ensure_ascii=False)[:600])
            break
        if time.time() - t0 > 900:
            print("TIMEOUT")
            break
        time.sleep(10)

    after = remain_point()
    print(f"remainPoint after = {after} ; delta = {round(before - after, 2)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
