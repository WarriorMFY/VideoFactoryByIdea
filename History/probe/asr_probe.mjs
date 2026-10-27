// 小循环 2 感知：ASR / 翻译模型与包的可获取性探测
const targets = [
  ['npm:@huggingface/transformers', 'https://registry.npmmirror.com/@huggingface/transformers'],
  ['npm:@xenova/transformers', 'https://registry.npmmirror.com/@xenova/transformers'],
  ['npm:onnxruntime-node', 'https://registry.npmmirror.com/onnxruntime-node'],
  ['npm:nodejs-whisper', 'https://registry.npmmirror.com/nodejs-whisper'],
  ['npm:whisper-node', 'https://registry.npmmirror.com/whisper-node'],
  ['hf:huggingface.co', 'https://huggingface.co/api/models?limit=1'],
  ['hf:codeload-hf.co', 'https://hf.co/api/models?limit=1'],
  ['hf:cdn-lfs', 'https://cdn-lfs.huggingface.co'],
  ['hf-mirror:hf-mirror.com', 'https://hf-mirror.com/api/models?limit=1'],
  ['modelscope', 'https://www.modelscope.cn/api/v1/models?PageSize=1'],
];

for (const [name, url] of targets) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { range: 'bytes=0-2047' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    const b = await r.arrayBuffer();
    console.log(`${name.padEnd(30)} ${r.status} ${(b.byteLength / 1024).toFixed(1)}KB ${((Date.now() - t0) / 1000).toFixed(1)}s  ${r.url.slice(0, 60)}`);
  } catch (e) {
    console.log(`${name.padEnd(30)} FAIL ${String(e.message).slice(0, 50)}`);
  }
}
