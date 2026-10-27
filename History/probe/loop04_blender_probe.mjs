const urls = [
  "https://download.blender.org/demo/movies/ToS/",
  "https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov",
  "https://download.blender.org/demo/movies/ToS/ToS-4k-1920.mov",
  "https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4",
  "https://ftp.nluug.nl/pub/graphics/blender/demo/movies/ToS/tears_of_steel_720p.mov",
  "https://media.w3.org/2010/05/sintel/trailer.mp4",
];
for (const u of urls) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
    const len = Number(r.headers.get("content-length") || 0);
    const type = r.headers.get("content-type") || "";
    try { await r.body?.cancel(); } catch {}
    let extra = "";
    if (r.ok && /html/i.test(type) && len < 400000) {
      const t = await (await fetch(u, { signal: AbortSignal.timeout(12000) })).text();
      extra = " | " + ([...t.matchAll(/href="([^"]+\.(?:mp4|mov|mkv|webm))"/gi)].map(m=>m[1]).slice(0,8).join(" ") || "(无媒体)");
    }
    console.log(`${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(4)} ${(len/1048576).toFixed(1)}MB ${String(Date.now()-t0).padStart(6)}ms ${type.padEnd(28)} ${u}${extra}`);
  } catch (e) {
    console.log(`FAIL ---- ${String(Date.now()-t0).padStart(6)}ms ${String(e.message).slice(0,40).padEnd(42)} ${u}`);
  }
}
