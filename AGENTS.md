<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# PowerShell curl quoting trap

PowerShell 5.1 strips double quotes when passing arguments to native executables (like curl.exe). The command below sends `{username:admin}` (NOT valid JSON):

```powershell
curl.exe -d '{"username":"admin"}'   # BROKEN - quotes stripped
```

Fix: use `--%` (stop-parsing symbol):

```powershell
curl.exe --% -d "{\"username\":\"admin\"}"
```

Or use a temporary file with `-d @file.json`.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:bilibili-streaming-notes -->
# B站 直链播放方案（源自 PiliPalaX APK 逆向分析）

## 关键发现（2026-07 分析 PiliPalaX_1.1.2-beta APK）

APK 无魔法，使用的是 B站 公开 API + Wbi 签名 + 本地 Cookie。

## 核心 B站 API 端点

### 视频播放
```
/x/player/wbi/v2              ← 主播放接口（返回 DASH 音视频分离流）
/x/player/wbi/playurl         ← 备选播放接口
/x/player/pagelist            ← 获取视频分 P / cid（从 bvid 查）
/x/player/online/total        ← 在线观看数
```

### 搜索
```
/x/web-interface/wbi/search/default  ← 搜索默认
/x/web-interface/wbi/search/type     ← 按类型搜索
```

### 会员空间/投稿
```
/x/space/wbi/arc/search              ← 空间投稿列表（会员视频合集）
/x/polymer/web-space/seasons_archives_list
/x/polymer/web-space/seasons_series_list
/x/polymer/web-dynamic/v1/feed/space ← 空间动态
```

### 番剧 PGC
```
/pgc/view/web/season                  ← 番剧信息
/pgc/season/index/result              ← 番剧索引
```

### 互动/关系
```
/x/relation/fans                     ← 粉丝列表
/x/relation/followings               ← 关注列表
/x/relation/modify                   ← 修改关系
/x/dm/filter/user                    ← 弹幕用户过滤
```

### 直播
```
https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo
https://api.live.bilibili.com/xlive/web-room/v1/index/getH5InfoByRoom
```

## Wbi 签名机制

所有 `wbi` 路径下的接口都需要 Wbi 签名：
1. 从 `https://api.bilibili.com/x/web-interface/nav` 获取 `img_key` 和 `sub_key`
2. 混合密钥：`mix_key = sub_key.substring(0, 4) + img_key.substring(0, 4)`
3. 查询参数按字典序排列
4. 拼接 `&wts={当前时间戳}&w_rid={md5(排序后的参数字符串 + mix_key)}`

APK 中 Wbi 签名实现路径：`package:PiliPalaX/utils/wbi_sign.dart`

## 播放接口关键参数

```
GET /x/player/wbi/v2?bvid={BVid}&cid={cid}&qn=116&fnval=4048&fourk=1&wts={ts}&w_rid={md5}
```

| 参数 | 值 | 说明 |
|------|-----|------|
| `qn` | 32/64/80/116/120 | 清晰度：480p/720p/1080p/1080p60/4K |
| `fnval` | 4048 | 请求所有格式（DASH+HDR+杜比+8K） |
| `fourk` | 1 | 允许 4K |

返回格式为 DASH（JSON 中包含 `dash.video[]` 和 `dash.audio[]`，每个有 `base_url` 指向 `.m4s` 文件）。

## Cookie 要求

至少需要 `buvid3` cookie，可以客户端自动生成（UUID-like 字符串）。高质量/登录态需要更多 cookie（buvid4, b_lsid, 等）。

## CDN 直链特征

返回的视频 URL 格式：
```
https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/.../...-1-30280.m4s
```
域名 `*.bilivideo.com` 是 B站 CDN，用户浏览器可直接访问（不检查 IP 来源）。

## APK 播放器架构

使用 `media_kit`（Flutter 版 mpv 封装）：
- 本地直接调 B站 API（用户设备 IP，不被封）
- mpv 原生支持 DASH（M4S 音视频合并）
- `PersistCookieJar` 持久化 Cookie
- `Dio` HTTP 客户端

## 与我们环境的差异

| APK | 我们 |
|-----|------|
| 用户设备 IP → B站 API | CF Workers IP → 被 B站 封 412 |
| 不走代理 | 必须经过 Deno 代理绕过 IP 封锁 |
| mpv 播放 DASH | 浏览器需要 dash.js/shaka-player |
| Cookie 存本地文件 | 需要服务器端维护 Cookie |

## 可迁移的 APK 功能（Web 版已实现/待实现）

| 功能 | APK 实现 | Web 版状态 |
|------|----------|-----------|
| DASH 播放 | media_kit (mpv) | ✅ dash.js 解析 MPD |
| 多清晰度切换 | mpv 自动 / 手动选轨 | ✅ dash.js ABR + 手动选择 |
| CDN 源切换 | 可选 (cos/ali/hwer/bd 等) | ✅ 播放器右上角 CDN 按钮 |
| 弹幕 | dm API (protobuf) | ⏳ 待加 (`/x/dm/v2/seg.so`) |
| 合集剧集切换 | 列表 UI | ⏳ 待加 (已有数据) |
| 视频信息展示 | 标题/简介/标签 | ✅ 从 Deno 代理获取 |
| 搜索 | search API | ⏳ 待加 |
| 投稿空间 | space API | ⏳ 待加 |
| 番剧 PGC | pgc API | ⏳ 待加 |
| 评论 | relation API | ⏳ 待加 |
<!-- END:bilibili-streaming-notes -->

<!-- BEGIN:direct-link-requirements -->
# 直链功能需求（2026-08 用户明确澄清，重要！）

## 站点结构（不要搞混）

**两套完全独立的视频观看方式：**

1. **主页播放 = B站官方播放器（iframe）** —— `/play/[id]` 等主页内容用官方播放器，**已经工作正常，不要动**
2. **后台生成的直链 = 完全去B站化的独立链接** —— 这是当前要做的重点

## 直链功能（当前任务）

后台管理（添加/编辑文章）时，**能生成直链链接**。这个直链：
- 完全去 B站 痕迹（无 iframe、无B站logo、无官方播放器）
- 合集和单个视频都能播放（单个 + 合集每集）
- 电脑 + 手机都能播放
- 跟网站主页内容无关（独立的链接，直接打开就是视频）
- 基于 PiliPalaX APK 逆向的直链方法，有**很多 CDN 加速节点**

## 现有相关代码

- 后台"刷新直链"按钮 → `/api/admin/articles/[id]/refresh-stream` 存 playurl 到 `stream_data`
- 后台 direct-links → `/api/admin/direct-links` 生成 DASH 分离 m4s 直链
- 播放直链端点 → `/api/stream/[id]`（返回 MPD）、`/api/durl/[bvid]`（完整mp4 302转发）
- 播放页 → `app/play/[id]/page.tsx`（现在会 fallback 到官方 iframe，手机端）

## 当前卡点

- **代理额度**：dash.js 每视频 100-300 次 Deno 请求烧额度。durl mp4 每视频 1-2 次（已实现 `/api/durl`，但只有 360p）
- Deno 免费额度 1万（绑卡100万），CF Pages IP 被 B站 API 封 412，CDN 也 403
- 目标：**省代理额度 + 满足直链观看需求**

## 环境事实（已实测确认）

- B站 API `fnval=0` → durl（完整mp4，仅360p匿名）；`fnval=16/4048` → dash（分离流，720p匿名）
- B站 CDN `bilivideo.com` 要求 `Referer: https://www.bilibili.com/`，浏览器跨域做不到
- 浏览器 `<video>` 播 mp4 不需要 CORS，但需要 Referer 正确
- CF Pages IP：B站 API 412、CDN 403（都不能直连）
- Deno Deploy IP：可用（能调 API + 转发 CDN）
<!-- END:direct-link-requirements -->
