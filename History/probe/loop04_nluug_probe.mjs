const lists = [
  "https://ftp.nluug.nl/pub/graphics/blender/demo/movies/",
  "https://ftp.nluug.nl/pub/graphics/blender/demo/movies/ToS/",
];
for (const u of lists) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    const items = [...t.matchAll(/href="([^"]+)"/gi)].map(m => m[1]).filter(h => !h.startsWith("?") && !h.startsWith("/") && !h.includes(".."));
    console.log(`\n=== ${u} HTTP ${r.status} 共 ${items.length} 项`);
    console.log(items.slice(0, 60).join("\n"));
  } catch (e) { console.log(`FAIL ${u}: ${e.message.slice(0,60)}`); }
}
// 速度测试：Range 取 ToS 前 6MB
const t0 = Date.now();
try {
  const r = await fetch("https://ftp.nluug.nl/pub/graphics/blender/demo/movies/ToS/tears_of_steel_720p.mov", {
    headers: { Range: "bytes=0-6291455" }, signal: AbortSignal.timeout(60000),
  });
  const buf = Buffer.from(await r.arrayBuffer());
  const sec = (Date.now() - t0) / 1000;
  console.log(`\n[速度] HTTP ${r.status} ${(buf.length/1048576).toFixed(1)}MB ${sec.toFixed(1)}s = ${(buf.length/1048576/sec).toFixed(2)}MB/s → 355MB 约需 ${Math.round(355/(buf.length/1048576/sec)/60)} 分钟`);
  console.log(`[头] ${buf.subarray(4,12).toString("ascii")} (ftyp=mp4 系容器)`);
} catch (e) { console.log(`\n速度测试失败: ${e.message.slice(0,80)}`); }
