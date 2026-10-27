const base = "https://ftp.nluug.nl/pub/graphics/blender/demo/movies/";
async function ls(u) {
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  const items = [...t.matchAll(/href="([^"]+)"/gi)].map(m => m[1]).filter(h => !h.startsWith("?") && !h.startsWith("http") && h !== "./" && !h.includes(".."));
  console.log(`\n=== ${u} (${items.length})`);
  console.log(items.join("\n"));
}
await ls(base + "ToS/subtitles/");
// Range 支持测试
const t0 = Date.now();
try {
  const r = await fetch(base + "ToS/tears_of_steel_720p.mov", { headers: { Range: "bytes=0-1048575" }, signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await r.arrayBuffer());
  const sec = (Date.now()-t0)/1000;
  console.log(`\n[Range] HTTP ${r.status} | content-range=${r.headers.get("content-range")} | 收到 ${(buf.length/1048576).toFixed(2)}MB / ${sec.toFixed(1)}s = ${(buf.length/1048576/sec).toFixed(2)}MB/s`);
} catch (e) { console.log(`\n[Range] 失败: ${e.name} ${e.message.slice(0,60)}`); }
