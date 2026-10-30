// 小循环 6 感知：精译后端可用性（LLM API）与 MyMemory 配额行为
const keys = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MOONSHOT_API_KEY', 'DASHSCOPE_API_KEY', 'SILICONFLOW_API_KEY'];
console.log('=== 环境变量里的 LLM Key ===');
for (const k of keys) {
  const v = process.env[k];
  console.log(`${k}: ${v ? `已设置（长度 ${v.length}）` : '未设置'}`);
}

console.log('\n=== LLM 端点可达性 ===');
const endpoints = [
  ['deepseek', 'https://api.deepseek.com/models'],
  ['openai', 'https://api.openai.com/v1/models'],
  ['moonshot', 'https://api.moonshot.cn/v1/models'],
  ['dashscope', 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'],
  ['siliconflow', 'https://api.siliconflow.cn/v1/models'],
];
for (const [name, url] of endpoints) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'dsh' }, signal: AbortSignal.timeout(12000) });
    console.log(`${name.padEnd(12)} HTTP ${r.status} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`${name.padEnd(12)} FAIL ${String(e.message).slice(0, 50)}`);
  }
}

console.log('\n=== MyMemory 单次请求长度上限（会明显影响长句翻译质量）===');
for (const q of ['a'.repeat(400) + ' hello', 'a'.repeat(900) + ' hello']) {
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|zh-CN`, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    console.log(`len=${q.length} -> status ${j.responseStatus} ${String(j.responseDetails || '').slice(0, 60)}`);
  } catch (e) { console.log('FAIL', e.message); }
}

console.log('\n=== 带标点的句子 vs 不带标点（同一内容，看机翻质量差异）===');
const pairs = [
  ['what brings you to the land of the gatekeepers', 'What brings you to the land of the gatekeepers?'],
  ['third normalize the audio to minus sixteen lufs which is the standard for online video platforms', 'Third, normalize the audio to minus sixteen LUFS, which is the standard for online video platforms.'],
];
for (const [raw, punct] of pairs) {
  const out = [];
  for (const q of [raw, punct]) {
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|zh-CN`, { signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      out.push(j?.responseData?.translatedText || '(空)');
    } catch { out.push('(失败)'); }
  }
  console.log(`  原文: ${raw.slice(0, 50)}…`);
  console.log(`    无标点: ${out[0]}`);
  console.log(`    有标点: ${out[1]}`);
}
