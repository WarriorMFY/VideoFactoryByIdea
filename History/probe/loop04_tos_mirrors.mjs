const mirrors = [
  "https://ftp.nluug.nl/pub/graphics/blender/demo/movies/ToS/tears_of_steel_720p.mov",
  "https://mirror.clarkson.edu/blender/demo/movies/ToS/tears_of_steel_720p.mov",
  "https://ftp.gwdg.de/pub/misc/blender/demo/movies/ToS/tears_of_steel_720p.mov",
  "https://mirror.us.leaseweb.net/blender/demo/movies/ToS/tears_of_steel_720p.mov",
  "https://mirrors.dotsrc.org/blender/demo/movies/ToS/tears_of_steel_720p.mov",
  "https://ftp.halifax.rwth-aachen.de/blender/demo/movies/ToS/tears_of_steel_720p.mov",
  "https://mirror.kumi.systems/blender/demo/movies/ToS/tears_of_steel_720p.mov",
];
for (const u of mirrors) {
  const host = new URL(u).hostname;
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: { Range: "bytes=0-2097151" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { try { await r.body?.cancel(); } catch {} console.log(`FAIL ${String(r.status)} ${host}`); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    const sec = (Date.now() - t0) / 1000;
    console.log(`${(b.length/1048576/sec).toFixed(2)}MB/s  ${(b.length/1048576).toFixed(1)}MB/${sec.toFixed(1)}s  ${host}`);
  } catch (e) {
    console.log(`FAIL ${e.name} ${host}`);
  }
}
