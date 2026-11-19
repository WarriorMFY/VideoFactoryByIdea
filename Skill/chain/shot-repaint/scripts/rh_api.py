"""RunningHub 最小客户端：只实现本技能要用的五个动作，纯标准库 + curl。

用：
  from rh_api import account_status, node_info, submit, poll, artifacts, cost, download

设计：不引任何外部模块，节点名以接口返回为准；出错统一 SystemExit，消息可直接照做。
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HOST = "https://www.runninghub.cn"
BASE = HOST + "/openapi/v2"
ACCOUNT = HOST + "/uc/openapi/accountStatus"
NODE_INFO = HOST + "/api/webapp/apiCallDemo"
SUBMIT = HOST + "/task/openapi/ai-app/run"
POLL = BASE + "/query"

POLL_INTERVAL = 5
POLL_MAX = 1200


def _curl(args, timeout=60):
    return subprocess.run(["curl", "-s", "-S", "--fail-with-body", *args],
                          capture_output=True, text=True, timeout=timeout + 15)


def _post(url, payload, key=None, timeout=60):
    fd, tmp = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    try:
        args = ["-X", "POST", url, "--max-time", str(timeout), "-d", "@" + tmp,
                "-H", "Content-Type: application/json"]
        if key:
            args += ["-H", "Authorization: Bearer " + key]
        return _curl(args, timeout)
    finally:
        os.unlink(tmp)


def _json(r, what):
    if r.returncode != 0:
        sys.exit("%s失败：%s" % (what, (r.stdout or r.stderr or "")[:400]))
    try:
        return json.loads(r.stdout)
    except (json.JSONDecodeError, TypeError):
        sys.exit("%s返回非 JSON：%s" % (what, (r.stdout or "")[:400]))


def account_status(key):
    """返回剩余积分（float），查不到返回 None。"""
    r = _post(ACCOUNT, {"apikey": key}, key, timeout=25)
    d = _json(r, "查账户").get("data") or {}
    v = d.get("remainPoint")
    return float(v) if v is not None else None


def node_info(key, webapp):
    """返回该 AI 应用的可改节点列表（[{nodeId,fieldName,fieldValue,...}]）。"""
    r = _curl([NODE_INFO + "?apiKey=%s&webappId=%s" % (key, webapp), "--max-time", "60"])
    resp = _json(r, "查节点")
    if resp.get("code") != 0:
        sys.exit("查节点失败：%s" % resp.get("msg", resp))
    nodes = (resp.get("data") or {}).get("nodeInfoList") or []
    if not nodes:
        sys.exit("该应用没有可改节点——先在网页端把应用跑通一次，再回来查")
    return nodes


def submit(key, webapp, nodes, instance="default"):
    """提交任务，返回 taskId。节点错误会在提交阶段就拦下。"""
    payload = {"apiKey": key, "webappId": int(webapp), "nodeInfoList": nodes}
    if instance and instance != "default":
        payload["instanceType"] = instance
    resp = _json(_post(SUBMIT, payload), "提交任务")
    if resp.get("code") != 0:
        sys.exit("提交失败：%s" % resp.get("msg", resp))
    data = resp.get("data") or {}
    tid = data.get("taskId")
    if not tid:
        sys.exit("提交失败：响应里没有 taskId——%s" % json.dumps(resp, ensure_ascii=False)[:300])
    tips = data.get("promptTips")
    if tips:
        try:
            errs = json.loads(tips).get("node_errors") or {}
        except (json.JSONDecodeError, TypeError, AttributeError):
            errs = {}
        if errs:
            sys.exit("节点错误：%s" % json.dumps(errs, ensure_ascii=False))
    return str(tid)


def poll(key, task_id):
    """轮询到终态，返回完整响应。SUCCESS 才有 results。"""
    print("Task ID: %s" % task_id)
    print("Waiting", end="", flush=True)
    waited = 0
    fails = 0
    while waited < POLL_MAX:
        time.sleep(POLL_INTERVAL)
        waited += POLL_INTERVAL
        r = _post(POLL, {"taskId": task_id}, key, timeout=30)
        if r.returncode != 0:
            fails += 1
            print("x", end="", flush=True)
            if fails >= 5:
                sys.exit("\n轮询连续失败 %d 次，放弃" % fails)
            continue
        fails = 0
        try:
            resp = json.loads(r.stdout)
        except (json.JSONDecodeError, TypeError):
            continue
        st = resp.get("status") or (resp.get("data") or {}).get("status")
        if st == "SUCCESS":
            print(" done (%ds)" % waited)
            return resp
        if st == "FAILED":
            sys.exit("\n任务失败：[%s] %s" % (resp.get("errorCode", ""),
                                             resp.get("errorMessage", "未知错误")))
        print(".", end="", flush=True)
    sys.exit("\n轮询超时 %ds" % POLL_MAX)


def artifacts(final):
    """取产物 [(url, ext)]；ext 可能为空。"""
    out = []
    for it in final.get("results") or []:
        url = it.get("url") or it.get("outputUrl")
        if url:
            out.append((url, it.get("outputType", "") or ""))
    return out


def cost(final):
    """本次任务消耗：优先 usage.chargedPoint，退回 consumeMoney／thirdPartyConsumeMoney。"""
    u = final.get("usage") or {}
    v = u.get("chargedPoint") or u.get("consumeMoney") or u.get("thirdPartyConsumeMoney")
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def download(url, out):
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["curl", "-s", "-S", "-L", "-o", str(out), "--max-time", "300", url],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("下载失败：%s" % (r.stderr or "")[:300])
    return str(Path(out).resolve())


if __name__ == "__main__":
    import argparse

    from credential import load_key

    ap = argparse.ArgumentParser(description="查通道节点真名（不消耗积分）")
    ap.add_argument("--info", required=True, metavar="APPID", help="webappId")
    ap.add_argument("--status", action="store_true", help="只查余额")
    a = ap.parse_args()
    if a.status:
        print("remainPoint", account_status(load_key()))
    else:
        for n in node_info(load_key(), a.info):
            print("%s:%s = %r" % (n.get("nodeId"), n.get("fieldName"), n.get("fieldValue")))

