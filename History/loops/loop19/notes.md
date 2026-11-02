# loop19 notes · B站同赛道学习

- 采样脚本 fetch_samples.mjs：6 关键词搜索（totalrank 排序）→ 去重 → 时长 3-40min & 播放≥1w → 前 18 → view+reply API。reply `ps=30` 会 -400，去掉即可。
- 下载：`playurl?platform=html5&high_quality=1` 返回 durl mp4（480p），无需签名/登录；dash-only 视频不支持。带 Referer+UA 即可。
- BV1ZV411a7Fc 实测 ASL 7.15s（TED原片级）→ 541w 播放冠军是零剪辑，只加双语字幕。
- BV15V411w79f（47w，21min）ASL 418s：全屏讲义页轮播，逐词注释+蓝高亮+侧栏词卡。视频=讲义载体。
- 励志混剪两条：ASL 3.7s / 2.15s（27.7 切/min），黑白暗调+居中金句+训练footage；评论区=打卡立flag文化。
- 竖屏切片 B站空白（搜索全是横屏蹭词）→ D1 线对B站降级。
- 热评样本：内容号评论谈内容；混剪号评论是互动玩法。字幕质量=入场券，观众不夸剪辑只骂烂字幕。
- 临时下载 Workspace/tmp/loop19_dl/ 可清理。
