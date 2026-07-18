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

  const { url } = await req.json();
  if (!url) return new Response(JSON.stringify({ success: false, error: "请输入 Bilibili 链接" }), { status: 400, headers });

  const match = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
  if (!match) return new Response(JSON.stringify({ success: false, error: "无法识别链接格式" }), { status: 400, headers });
  const bvid = match[1];

  try {
    const biliRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: "https://www.bilibili.com" },
    });

    if (!biliRes.ok) {
      const htmlRes = await fetch(`https://www.bilibili.com/video/${bvid}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: "https://www.bilibili.com" },
      });
      if (!htmlRes.ok) return new Response(JSON.stringify({ success: false, error: `Bilibili ${htmlRes.status}` }), { status: 502, headers });
      const html = await htmlRes.text();
      const m = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
      if (!m) return new Response(JSON.stringify({ success: false, error: "无法解析页面数据" }), { status: 502, headers });
      const data = JSON.parse(m[1]);
      const vd = data.videoData;
      if (!vd) return new Response(JSON.stringify({ success: false, error: "未找到视频数据" }), { status: 502, headers });
      let htmlSeries;
      if (vd.videos > 1 && vd.pages?.length > 1) {
        htmlSeries = { title: vd.title || '', videos: vd.pages.map((p: any) => ({ bvid: vd.bvid || bvid, title: p.part || `第${p.page}集`, cover_url: vd.pic || '', page: p.page })) };
      }
      if (data.ugcSeason) {
        htmlSeries = { season_id: data.ugcSeason.id, title: data.ugcSeason.title || "", videos: (data.ugcSeason.episodes || []).map((ep: any) => ({ bvid: ep.bvid, title: ep.title || "", cover_url: ep.cover || "" })) };
      }
      return new Response(JSON.stringify({ success: true, data: { video: { bvid: vd.bvid || bvid, title: vd.title || "", description: (vd.desc || "").slice(0, 500), cover_url: vd.pic || "", duration: vd.duration || 0 }, series: htmlSeries } }), { headers });
    }

    const json = await biliRes.json();
    if (json.code !== 0) return new Response(JSON.stringify({ success: false, error: json.message || "Bilibili API error" }), { status: 502, headers });

    const d = json.data;
    let series;

    if (d.videos > 1 && d.pages?.length > 1) {
      series = { title: d.title || '', videos: d.pages.map((p: any) => ({ bvid: d.bvid, title: p.part || `第${p.page}集`, cover_url: d.pic || '', page: p.page })) };
    }

    if (d.ugc_season?.id) {
      try {
        const sRes = await fetch(`https://api.bilibili.com/x/web-interface/season/season?season_id=${d.ugc_season.id}`, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com" } });
        const sJson = await sRes.json();
        if (sJson.code === 0 && sJson.data) {
          series = { season_id: d.ugc_season.id, title: sJson.data.title || "", videos: (sJson.data.episodes || []).map((ep: any) => ({ bvid: ep.bvid, title: ep.title || "", cover_url: ep.cover || "" })) };
        }
      } catch {}
    }

    return new Response(JSON.stringify({ success: true, data: { video: { bvid: d.bvid, title: d.title || "", description: (d.desc || "").slice(0, 500), cover_url: d.pic || "", duration: d.duration || 0 }, series } }), { headers });
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

### 4. 更新后台配置

在 `app/admin/articles/new/page.tsx` 中找到 Deno proxy URL：

```ts
const denoRes = await fetch('https://rustic-mayfly-8854.zse1254.deno.net', {
```

替换成你部署后得到的 URL。

## API 使用方式

**请求：**

```bash
curl -X POST https://你的域名.deno.dev \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bilibili.com/video/BV1Ha4y1i7zJ"}'
```

**响应格式：**

```json
{
  "success": true,
  "data": {
    "video": {
      "bvid": "BV1Ha4y1i7zJ",
      "title": "视频标题",
      "description": "视频简介（前500字）",
      "cover_url": "http://i1.hdslb.com/bfs/archive/xxx.jpg",
      "duration": 11343
    },
    "series": {
      "title": "合集标题",
      "videos": [
        { "bvid": "BV1Ha4y1i7zJ", "title": "第1集标题", "cover_url": "...", "page": 1 },
        { "bvid": "BV1Ha4y1i7zJ", "title": "第2集标题", "cover_url": "...", "page": 2 }
      ]
    }
  }
}
```

- `series` 字段**可能为 null**（当视频不属于任何合集/分P时）
- `series.videos[].page` 只在**分P视频**（同一 BVID 多集）中存在
- `series.videos[].bvid` 在**UGC 合集**（不同 BVID）中各不相同

## 支持的链接格式

- `https://www.bilibili.com/video/BVxxx`
- `https://www.bilibili.com/video/BVxxx?p=2`
- `https://www.bilibili.com/video/BVxxx?spm_id_from=xxx`

## 已知限制

- 目前仅支持 `bilibili.com/video/` 路径的链接
- 不支持 `b23.tv` 短链接（需要先展开）
- Deno Deploy 免费版有每月 10 万请求的配额
- 如果 Deno Deploy IP 未来也被 Bilibili 屏蔽，则需要更换其他平台

## 故障排查

| 现象 | 原因 |
|------|------|
| 返回 `Method not allowed` | 用浏览器直接打开 URL 了（GET），需要用 POST 调用 |
| 返回 `Bilibili 412` | Bilibili 封锁了该服务器 IP，需换平台 |
| 返回 `Bilibili 502` | Bilibili 服务暂时不可用 |
| 后台一直转圈没反应 | 检查 URL 是否在 page.tsx 中配置正确 |
