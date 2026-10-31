// 只读探测②：摸清「稿件列表/数据/上传」相关端点的真实形状（不带任何凭据）
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const H = { "User-Agent": UA, Referer: "https://member.bilibili.com/platform/home" };
const list = [
  ["稿件列表 v1", "https://member.bilibili.com/x/vu/web/search?status=0&pn=1&ps=5"],
  ["稿件列表 v2", "https://member.bilibili.com/x/vu/web/archives?status=0&pn=1&ps=5"],
  ["稿件列表 v3", "https://member.bilibili.com/x/vu/web/archive/list?pn=1&ps=5"],
  ["稿件列表 v4", "https://member.bilibili.com/x/web/archives?status=all&pn=1&ps=5"],
  ["投稿添加(gate)", "https://member.bilibili.com/x/vu/web/add"],
  ["预上传(gate)", "https://member.bilibili.com/x/vu/web/add/v3"],
  ["WBI 空间投稿(无签名)", "https://api.bilibili.com/x/space/wbi/arc/search?mid=1&pn=1&ps=3"],
  ["WBI 空间投稿(普通)", "https://api.bilibili.com/x/space/arc/search?mid=1&pn=1&ps=3"],
  ["视频详情(公开)", "https://api.bilibili.com/x/web-interface/view?bvid=BV17rxT6UEpH"],
  ["UP主统计", "https://api.bilibili.com/x/relation/stat?vmid=1"],
  ["创作数据(需登录)", "https://member.bilibili.com/x/web/data/pandora"],
];
for (const [name, url] of list) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(15000) });
    const ct = r.headers.get("content-type") || "";
    let note;
    if (ct.includes("json")) { const j = await r.json(); note = `code=${j.code} ${String(j.message || "").slice(0, 30)}`; }
    else note = `html ${r.status}`;
    console.log(`${String(r.status).padEnd(4)} ${String(Date.now()-t0).padStart(5)}ms ${name.padEnd(20)} ${note}`);
  } catch (e) { console.log(`FAIL ${String(Date.now()-t0).padStart(5)}ms ${name.padEnd(20)} ${e.name}`); }
}
