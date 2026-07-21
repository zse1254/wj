# Bilibili 视频信息获取代理 — Deno Deploy

## 用途

浏览器的 CORS 限制 + Cloudflare Workers IP 被 Bilibili 屏蔽，导致后台「粘贴链接自动获取视频信息」功能无法正常工作。  
这个 Deno Deploy 代理通过 **不同的服务器 IP** 转发请求，绕过封锁。

## 部署步骤

### 1. 打开 Deno Deploy

https://dash.deno.com/

### 2. 创建 Playground

- 左侧点 **Playgrounds** → **New Playground**
- 全选删掉默认代码
- 粘贴以下完整代码：

```typescript
// ============================================================
// Bilibili Proxy — 视频信息获取 + Wbi 签名直链
// 部署到 Deno Deploy (Playground)
// ============================================================

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://www.bilibili.com",
  "Origin": "https://www.bilibili.com",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

function genBuvid3(): string {
  const h = () => Math.random().toString(16).slice(2, 10);
  return `${h()}-${h().slice(0,4)}-${h().slice(0,4)}-${h().slice(0,4)}-${h()}${h().slice(0,4)}infoc`;
}

function biliHeaders(): Record<string, string> {
  return { ...HEADERS, Cookie: `buvid3=${genBuvid3()}` };
}

// ---------- Wbi 签名 ----------

let wbiCache: { mix_key: string; expires_at: number } | null = null;

// B站官方字符重排表（64 项，生成 mixinKey 时只用前 32 项取字符）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18,  2, 53,  8, 23, 32, 15, 50, 10, 31, 58,  3, 45, 35,
  27, 43,  5, 49, 33,  9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48,  7, 16, 24, 55, 40, 61, 26, 17,  0,  1, 60, 51, 30,  4,
  22, 25, 54, 21, 56, 59,  6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;  // imgKey 在前，总长 64
  return MIXIN_KEY_ENC_TAB.map(n => raw[n]).join("").slice(0, 32);
}

async function getWbiKeys(): Promise<{ img_key: string; sub_key: string }> {
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: biliHeaders() });
  const json = await res.json();
  // nav 未登录时返回 code=-101，但 wbi_img 仍然有效，可直接取用
  const data = json.data;
  const img = data?.wbi_img?.img_url || "";
  const sub = data?.wbi_img?.sub_url || "";
  if (!img || !sub) throw new Error("获取 Wbi 密钥失败: " + (json.message || JSON.stringify(json).slice(0, 100)));
  const img_key = img.replace(/^.*\/(\w+)\.\w+$/, "$1");
  const sub_key = sub.replace(/^.*\/(\w+)\.\w+$/, "$1");
  return { img_key, sub_key };
}

async function getMixKey(): Promise<string> {
  if (wbiCache && Date.now() < wbiCache.expires_at) return wbiCache.mix_key;
  const { img_key, sub_key } = await getWbiKeys();
  const mix = getMixinKey(img_key, sub_key);
  wbiCache = { mix_key: mix, expires_at: Date.now() + 3600_000 }; // 1h 缓存
  return mix;
}

// Deno Deploy 不再支持 crypto.subtle.digest("MD5")，自实现 MD5
function md5Sync(input: string): string {
  const msg = new TextEncoder().encode(input);
  const rotL = (n: number, b: number) => (n << b) | (n >>> (32 - b));
  // padding
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(((msg.length + 8) >> 6) * 64 + 64);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), true);
  dv.setUint32(padded.length - 4, bitLen >>> 0, true);
  // constants
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    const M = new Array(16);
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotL(F, S[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const toHex = (n: number) => {
    let h = '';
    for (let i = 0; i < 4; i++) h += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return h;
  };
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

function md5(str: string): string { return md5Sync(str); }

async function wbiSign(params: Record<string, string>): Promise<Record<string, string>> {
  const mix = await getMixKey();
  const ts = Math.floor(Date.now() / 1000);
  const chr_filter = /[!'()*]/g;
  const paramsWithWts = { ...params, wts: String(ts) };
  const sorted = Object.keys(paramsWithWts).sort();
  const query = sorted.map(k => {
    const v = paramsWithWts[k].replace(chr_filter, "");
    return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  }).join("&");
  const w_rid = md5(query + mix);
  return { ...params, wts: String(ts), w_rid };
}

// ---------- Action: 获取视频信息（原有逻辑） ----------

async function actionInfo(body: any): Promise<any> {
  const { url } = body;
  if (!url) return { success: false, error: "请输入 Bilibili 链接" };
  const match = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
  if (!match) return { success: false, error: "无法识别链接格式" };
  const bvid = match[1];

  // 尝试 API
  const biliRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: biliHeaders() });
  if (biliRes.ok) {
    const json = await biliRes.json();
    if (json.code === 0) {
      const d = json.data;
      let series;
      if ((d.videos > 1 || (d.pages?.length || 0) > 1) && d.pages?.length > 1) {
        series = { title: d.title || "", videos: d.pages.map((p: any) => ({ bvid: d.bvid, title: p.part || `第${p.page}集`, cover_url: d.pic || "", page: p.page, duration: p.duration || 0 })) };
      }
      if (d.ugc_season?.id) {
        try {
          const sRes = await fetch(`https://api.bilibili.com/x/web-interface/season/season?season_id=${d.ugc_season.id}`, { headers: biliHeaders() });
          const sJson = await sRes.json();
          if (sJson.code === 0 && sJson.data) {
            series = { season_id: d.ugc_season.id, title: sJson.data.title || "", videos: (sJson.data.episodes || []).map((ep: any) => ({ bvid: ep.bvid, title: ep.title || "", cover_url: ep.cover || "", page: ep.page || 1, duration: ep.duration || 0 })) };
          }
        } catch {}
      }
      return { success: true, data: { video: { bvid: d.bvid, title: d.title || "", description: (d.desc || "").slice(0, 500), cover_url: d.pic || "", duration: d.duration || 0 }, series } };
    }
  }

  // API 失败 → 解析 HTML
  const htmlRes = await fetch(`https://www.bilibili.com/video/${bvid}`, { headers: biliHeaders() });
  if (!htmlRes.ok) return { success: false, error: `Bilibili ${htmlRes.status}` };
  const html = await htmlRes.text();
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
  if (!m) return { success: false, error: "无法解析页面数据" };
  const data = JSON.parse(m[1]);
  const vd = data.videoData;
  if (!vd) return { success: false, error: "未找到视频数据" };
  let series;
  if (vd.videos > 1 && vd.pages?.length > 1) {
    series = { title: vd.title || "", videos: vd.pages.map((p: any) => ({ bvid: vd.bvid || bvid, title: p.part || `第${p.page}集`, cover_url: vd.pic || "", page: p.page, duration: p.duration || 0 })) };
  }
  if (data.ugcSeason) {
    series = { season_id: data.ugcSeason.id, title: data.ugcSeason.title || "", videos: (data.ugcSeason.episodes || []).map((ep: any) => ({ bvid: ep.bvid, title: ep.title || "", cover_url: ep.cover || "", page: ep.page || 1, duration: ep.duration || 0 })) };
  }
  return { success: true, data: { video: { bvid: vd.bvid || bvid, title: vd.title || "", description: (vd.desc || "").slice(0, 500), cover_url: vd.pic || "", duration: vd.duration || 0 }, series } };
}

// ---------- Action: 获取播放直链（playurl / DASH） ----------

async function actionPlayurl(body: any): Promise<any> {
  const { bvid, cid: rawCid, qn } = body;
  if (!bvid) return { success: false, error: "缺少 bvid" };

  // 如果没有 cid，先获取 pagelist
  let cid = rawCid;
  if (!cid) {
    const plRes = await fetch(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, { headers: biliHeaders() });
    const plJson = await plRes.json();
    if (plJson.code !== 0 || !plJson.data?.length) return { success: false, error: "获取 cid 失败" };
    cid = plJson.data[0].cid;
  }

  const targetQn = qn || 80; // 默认 1080p
  const commonParams = `bvid=${bvid}&cid=${cid}&qn=${targetQn}&fnval=4048&fourk=1`;
  const playHeaders = {
    ...biliHeaders(),
    Referer: `https://www.bilibili.com/video/${bvid}`,
  };

  // 策略1: 旧版 /x/player/playurl 端点（无 wbi 签名，无登录场景下也返完整 DASH）
  // 这是 PiliPalaX APK 匿名播放的核心端点
  try {
    const puRes = await fetch(`https://api.bilibili.com/x/player/playurl?${commonParams}`, { headers: playHeaders });
    const puJson = await puRes.json();
    if (puJson.code === 0 && puJson.data?.dash) {
      const playData = puJson.data;
      return {
        success: true,
        data: {
          bvid,
          cid: Number(cid),
          quality: playData.quality,
          accept_quality: playData.accept_quality || [],
          accept_qn: playData.accept_qn || [],
          video_duration: playData.dash?.duration || 0,
          dash: playData.dash,
          durl: playData.durl || null,
          endpoint: 'playurl',
        },
      };
    }
  } catch (e) {
    console.error('[playurl] fallback endpoint failed:', (e as Error).message);
  }

  // 策略2: wbi/v2 端点（需登录态拿完整 DASH，无登录时可能返 preview）
  const unsigned: Record<string, string> = {
    bvid, cid: String(cid),
    qn: String(targetQn),
    fnval: "4048",
    fourk: "1",
  };
  const signed = await wbiSign(unsigned);
  const query = Object.entries(signed).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const puRes = await fetch(`https://api.bilibili.com/x/player/wbi/v2?${query}`, { headers: playHeaders });
  const puJson = await puRes.json();
  if (puJson.code !== 0) return { success: false, error: puJson.message || "playurl 接口返回错误" };

  const playData = puJson.data;
  if (!playData.dash) {
    return { success: false, error: "无登录态无法获取 DASH,且旧端点也失败: " + (playData.preview_toast || "no dash") };
  }
  return {
    success: true,
    data: {
      bvid,
      cid: Number(cid),
      quality: playData.quality,
      accept_quality: playData.accept_quality || [],
      accept_qn: playData.accept_qn || [],
      video_duration: playData.dash?.duration || 0,
      dash: playData.dash,
      durl: playData.durl || null,
      endpoint: 'wbi/v2',
    },
  };
}

// ---------- Router ----------

async function handler(req: Request): Promise<Response> {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, message: "Bilibili proxy is running" }), { headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const body = await req.json();
    const { action } = body;
    let result: any;

    if (action === "playurl") {
      result = await actionPlayurl(body);
    } else {
      // 默认 action = "info"
      result = await actionInfo(body);
    }

    const status = result.success ? 200 : 502;
    return new Response(JSON.stringify(result), { status, headers });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message || "Server error" }), { status: 500, headers });
  }
}

Deno.serve(handler);
```

### 3. 部署

点击 **Save & Deploy** 按钮。部署完成后会显示一个 URL，如：

```
https://rustic-mayfly-8854.zse1254.deno.net
```

### 4. 后续步骤

部署后即可部署新的 Deno 项目（同样的代码），获得多个备用 URL。

## API 使用方式

### 获取视频信息（同原有功能）

```bash
curl -X POST https://你的域名.deno.dev \
  -H "Content-Type: application/json" \
  -d '{"action":"info","url":"https://www.bilibili.com/video/BV1Ha4y1i7zJ"}'
```

### 获取播放直链（新增）

```bash
curl -X POST https://你的域名.deno.dev \
  -H "Content-Type: application/json" \
  -d '{"action":"playurl","bvid":"BV1Ha4y1i7zJ","cid":12345,"qn":80}'
```

| 参数 | 说明 | 默认 |
|------|------|------|
| `bvid` | 视频 BV 号 | 必填 |
| `cid` | 分 P ID（不传则自动获取） | 可选 |
| `qn` | 清晰度：32/64/80/116/120 | 80 (1080p) |
| `action` | `"info"` 或 `"playurl"` | `"info"` |

**playurl 响应格式：**

```json
{
  "success": true,
  "data": {
    "bvid": "BV1xx",
    "cid": 12345,
    "quality": 80,
    "accept_quality": [16,32,64,80],
    "video_duration": 300,
    "dash": {
      "video": [
        { "id": 80, "base_url": "https://upos-sz-mirrorcos.bilivideo.com/...m4s",
          "backup_url": ["https://...", "..."], "width": 1920, "height": 1080, "bandwidth": 5000000 }
      ],
      "audio": [
        { "id": 30280, "base_url": "https://upos-sz-mirrorcos.bilivideo.com/...m4s",
          "backup_url": ["https://..."], "bandwidth": 320000 }
      ]
    },
    "durl": null
  }
}
```

## 备用 Deno 方案

在 CF Worker 代码中配置多个 URL，失败时自动切换：

```typescript
const DENO_PROXIES = [
  "https://rustic-mayfly-8854.zse1254.deno.net",
  "https://你的二号域名.deno.dev",
  "https://你的三号域名.deno.dev",
];
```

部署多个 Deno 项目：同样的代码创建新的 Playground，粘贴后部署，把新 URL 加入数组即可。

## 故障排查

| 现象 | 原因 |
|------|------|
| 返回 `Method not allowed` | 用浏览器直接打开 URL 了（GET），需要用 POST 调用 |
| 返回 `Bilibili 412` | Bilibili 封锁了该服务器 IP，需换平台 |
| 返回 `获取 Wbi 密钥失败` | Deno 到 api.bilibili.com 网络不通，重试或换 URL |
| 后台一直转圈没反应 | 检查 URL 是否在 page.tsx 中配置正确 |
