// 探测 test-videos.co.uk 目录里有哪些可用片段（找带音轨/对话的）
const r = await fetch('https://test-videos.co.uk/', { signal: AbortSignal.timeout(20000) });
const html = await r.text();
const links = Array.from(new Set((html.match(/href="([^"]+)"/g) || []).map((m) => m.slice(6, -1))));
console.log('links:', links.length);
console.log(links.filter((u) => /vid|mp4|sintel|bunny|jelly|audio|webm/i.test(u)).slice(0, 40).join('\n'));
