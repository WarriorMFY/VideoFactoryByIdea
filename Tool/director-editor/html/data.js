/* 种子数据：来自 Log/Circle31、Log/Circle32 的真实现场，按 5 个 tab 的结构摆放。
   只在首次启动、Workspace/Projects/ 为空时用一次——boot() 会把它们 POST 成
   真实项目目录（Workspace/Projects/<id>/project.json），此后一切以磁盘为准。 */
window.SEED_PROJECTS = [
  {
    id: "c32",
    name: "NASApunk 工程师 · 火箭起飞 30s",
    circle: 32,
    status: "paused",
    updated: "2026-11-24",
    budget: { total: 300, spent: 312.74 },
    script: {
      logline: "发射前最后 30 秒，一个工程师跑完六个动作：许可、赶路、破门、泄压、见证、升空。",
      source: "Log/Circle32/script.md",
      beats: [
        { no: 1, name: "联锁", role: "许可", hook: "压杆到底，红灯转绿" },
        { no: 2, name: "走廊", role: "赶路", hook: "脚步沿黄黑警示线推进" },
        { no: 3, name: "卡门", role: "受阻", hook: "手扣门缝 + 警示灯起转" },
        { no: 4, name: "泄压", role: "破障", hook: "白雾喷出，门被气压推开" },
        { no: 5, name: "点火", role: "见证", hook: "喷口点火，火光点亮护目镜" },
        { no: 6, name: "离塔", role: "升空", hook: "火箭缩成亮点，纸页翻动" }
      ],
      notes: "六镜因果链；每镜 5s；片长 30.0s。"
    },
    /* 一个项目可存多张风格卡，但只能锁定一张当风格锚（styleLockedId） */
    styles: [
      {
        id: "S1",
        name: "NASApunk（白 + 橙）",
        keywords: ["哑光陶瓷白", "航天橙", "航蓝", "金箔", "高调冷白顶光", "整齐管线", "警示条纹"],
        palette: [
          { hex: "#F2EFE8", name: "陶瓷白" },
          { hex: "#E56020", name: "航天橙" },
          { hex: "#1F3A5F", name: "航蓝" },
          { hex: "#C9A227", name: "金箔" },
          { hex: "#8A8F98", name: "中性灰" }
        ],
        rules: [
          "禁霓虹、锈迹、紫青、夜景",
          "材质哑光、管线整齐、警示条纹成体系",
          "镜 1/3/4 室内高调冷白；镜 5/6 室外冷灰天 + 橙白光柱",
          "靠「白 + 橙」两色贯穿全片"
        ],
        prompt: "",
        /* 2026-11-24 21:16 网页控制台实测生成：实扣 11.35，任务 2125217053131628545
           file 是项目内相对路径 → /projects/c32/<file> */
        image: {
          kind: "t2i",
          file: "t2i/runs/c32-S1-test-1124-211640/out.png",
          taskId: "2125217053131628545",
          charged: 11.35,
          runId: "c32-S1-test-1124-211640"
        }
      },
      {
        id: "S2",
        name: "航站白夜（备选 · 未生成）",
        keywords: ["冷白荧光", "钢蓝", "长焦压缩", "湿地面反光"],
        palette: [
          { hex: "#DDE4EA", name: "冷白" },
          { hex: "#2C3E50", name: "钢蓝" }
        ],
        rules: ["不要暖光，整片压在 6500K 以上"],
        prompt: "",
        image: null
      }
    ],
    styleLockedId: "S1",
    anchorGroups: [
      {
        id: "site",
        label: "场地",
        hint: "同一个世界里的场景与空间，决定光、材质与纵深",
        items: [
          { id: "A2-indoor", kind: "场景·室内", status: "locked", note: "控制台 + 白舱走廊 + 气闸 · 11.80", src: null },
          { id: "A3-outdoor", kind: "场景·地面", status: "locked", note: "钢构观测位 + 发射塔 · 11.65", src: null },
          { id: "A3b-aerial", kind: "场景·俯瞰", status: "locked", note: "45° 高空俯视全场 · 11.50", src: null },
          { id: "A2-corridor", kind: "来源图·本地裁切", status: "locked", note: "A2 裁出走廊，1048×590，零积分", src: null }
        ]
      },
      {
        id: "character",
        label: "角色",
        hint: "身份锚：正脸、全身、局部（手）分开存",
        items: [
          { id: "A1-engineer", kind: "角色·全身", status: "locked", note: "白服 / 橙交叉背带 / 挂脖护目镜 / 夹板 · 12.58", src: null },
          { id: "A1-hand", kind: "角色·局部", status: "locked", note: "手部参考，出图时作第三张参考", src: null }
        ]
      },
      {
        id: "camera",
        label: "机位",
        hint: "场景锚里的「机位之锚」：定了它，关键帧与分镜都被它框住",
        items: [
          { id: "A2b-ovs", kind: "机位·越肩", status: "locked", note: "操作位左后 45°，镜 1 用 · 10.72", src: null },
          { id: "A4-airlock", kind: "机位·气闸正面", status: "draft", note: "镜 3/4 用；门缝与灯状态未成立 · 18.87", src: null }
        ]
      },
      {
        id: "key",
        label: "关键",
        hint: "关键帧与关键物（语义待你定：是分镜的首帧，还是道具特写）",
        items: [
          { id: "K1d-out2", kind: "关键帧·镜 1", status: "draft", note: "手落拨杆、站位成立；M1 用它跑过", src: null },
          { id: "K2b-out2", kind: "关键帧·镜 2", status: "draft", note: "背影朝气闸，夹板在腋下；M2 用它跑过", src: null },
          { id: "K3b-left", kind: "关键帧·镜 3", status: "draft", note: "双联画左格裁切 964×542，未证", src: null }
        ]
      }
    ],
    shots: [
      { no: 1, title: "联锁", time: "0–5s", size: "中近景", move: "固定", action: "翻开红盖 → 压杆到底 → 一排灯红转绿", firstFrame: "手悬在拨杆上方，盖已开，全排红灯", status: "M1 已出·半过", src: null },
      { no: 2, title: "走廊", time: "5–10s", size: "中全景", move: "贴背跟推", action: "抱夹板快走，脚踏警示线，顶灯掠过", firstFrame: "背影朝气闸，人刚进画", status: "M2 已出·半过", src: null },
      { no: 3, title: "卡门", time: "10–15s", size: "中景·微仰", move: "固定", action: "门顿住 → 两步上前 → 手扣门缝 → 灯转", firstFrame: "门留窄缝漏冷白光，背影侧身抬手", status: "K3b 候选·未证", src: null },
      { no: 4, title: "泄压", time: "15–20s", size: "近景·侧后 3/4", move: "固定", action: "扳下红黄手柄 → 喷白雾 → 门被推开", firstFrame: "手伸向手柄，门缝透橙光", status: "未开始", src: null },
      { no: 5, title: "点火", time: "20–25s", size: "过肩中景", move: "固定·微仰", action: "扶栏抬头 → 喷口点火 → 火光照脸", firstFrame: "背影刚扶栏，远方喷口未亮", status: "未开始", src: null },
      { no: 6, title: "离塔", time: "25–30s", size: "大远景·仰", move: "固定", action: "火箭拖烟柱上升 → 强风吹到观测位 → 纸页翻动", firstFrame: "火箭贴塔，白烟刚起", status: "未开始", src: null }
    ],
    compose: {
      duration: "30.0s（6×5s）",
      res: "1056×608 · 24fps",
      audio: "三层合成音轨（零积分）",
      checks: [
        { label: "六段齐备、尺寸帧率一致", done: false },
        { label: "拼接点 mad 高于邻帧", done: false },
        { label: "无黑帧", done: false },
        { label: "单文件 mp4 + 音轨", done: false }
      ],
      notes: "已出 M1、M2 两条；镜 3 未定稿，镜 4–6 未跑。预算已超 12.74。"
    }
  },
  {
    id: "c31",
    name: "锈日 25s v3",
    circle: 31,
    status: "done",
    updated: "2026-11-23",
    budget: { total: 500, spent: 427.99 },
    script: {
      logline: "锈色天幕下，一次短兵相接的 25 秒。",
      source: "Log/Circle31/Circle.md",
      beats: [
        { no: 1, name: "对峙", role: "起势", hook: "抬眼" },
        { no: 2, name: "交手", role: "冲突", hook: "兵器相接的火星" }
      ],
      notes: "v3 已结圈，带音轨。"
    },
    styles: [
      {
        id: "S1",
        name: "锈日（暗 fantasy 变体）",
        keywords: ["锈红", "尘雾", "逆光", "硬阴影"],
        palette: [
          { hex: "#6B2E1B", name: "锈红" },
          { hex: "#D9C7A7", name: "尘白" },
          { hex: "#22201E", name: "暗铁" }
        ],
        rules: ["低饱和、颗粒、逆光轮廓"],
        prompt: "",
        image: null
      }
    ],
    styleLockedId: "S1",
    anchorGroups: [
      {
        id: "site", label: "场地", hint: "场景与空间",
        items: [{ id: "A1-场景", kind: "场景", status: "locked", note: "圈 31 场景锚", src: null }]
      },
      {
        id: "character", label: "角色", hint: "身份锚",
        items: [{ id: "A2-角色", kind: "角色", status: "locked", note: "圈 31 角色锚", src: null }]
      },
      { id: "camera", label: "机位", hint: "机位之锚", items: [] },
      { id: "key", label: "关键", hint: "关键帧与关键物", items: [] }
    ],
    shots: [
      { no: 1, title: "对峙", time: "0–5s", size: "中景", move: "固定", action: "抬眼", firstFrame: "人半身，兵器在侧", status: "已完成", src: null },
      { no: 2, title: "交手", time: "5–10s", size: "中近景", move: "固定", action: "兵器相接", firstFrame: "兵器相向", status: "已完成", src: null }
    ],
    compose: {
      duration: "25.0s",
      res: "1056×608 · 24fps",
      audio: "三层合成音轨",
      checks: [
        { label: "六段齐备、尺寸帧率一致", done: true },
        { label: "拼接点 mad 高于邻帧", done: true },
        { label: "无黑帧", done: true },
        { label: "单文件 mp4 + 音轨", done: true }
      ],
      notes: "已结圈，样张在 RAG/。"
    }
  }
];
