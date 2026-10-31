// 只读探测：B 站「登录态/投稿」相关端点在本沙箱是否可达（一律 GET，不发送任何凭据）
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const probes = [
  ["nav(登录态)", "https://api.bilibili.com/x/web-interface/nav"],
  ["投稿页", "https://member.bilibili.com/platform/upload/video/frame"],
  ["稿件列表API", "https://member.bilibili.com/x/vu/web/search?status=0&pn=1&ps=5"],
  ["创作中心", "https://member.bilibili.com/platform/home"],
  ["分区树", "https://api.bilibili.com/x/v2/region/index"],
  ["粉丝数(公开)", "https://api.bilibili.com/x/relation/stat?vmid=1"],
];
for (const [name, url] of probes) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://member.bilibili.com/" }, signal: AbortSignal.timeout(15000) });
    const ct = r.headers.get("content-type") || "";
    let note = "";
    if (ct.includes("json")) { const j = await r.json(); note = `code=${j.code} ${String(j.message||"").slice(0,40)}`; }
    else { const t = await r.text(); note = `html(${t.length}B) ${(t.includes("登录") ? "含'登录'" : "")}`; }
    console.log(`OK   ${r.status} ${String(Date.now()-t0).padStart(5)}ms  ${name.padEnd(14)} ${note}`);
  } catch (e) {
    console.log(`FAIL  ----  ${String(Date.now()-t0).padStart(5)}ms  ${name.padEnd(14)} ${e.name} ${String(e.message).slice(0,50)}`);
  }
}
