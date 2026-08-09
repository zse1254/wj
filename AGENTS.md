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

<!-- BEGIN:合集播放bug-2026-08 -->
# 合集播放页 bug：手机打开合集自动跳到第一集

## 背景
用户：站长本人，用安卓手机自带浏览器测试。已经为这个问题反复反馈了很多次，非常厌烦反复询问。**看到问题务必直接修，不要反复问"用的什么浏览器/打开哪个链接/看到什么"。**

## 已确认事实（用户明确告知，不要质疑）
1. **两条不同的链接/播放器：**
   - **合集链接** = `https://wj.hvhh.cn/play/1e0ac449-cb63-4087-9e88-7a3fb4b592f2?v=2`（对应 bvid `BV1Ya411p7Z5`，37 集）。这是**合集播放器**页（有"剧集(37)"按钮、连播、"选集横条"）。
   - **第一集链接** = `https://wj.hvhh.cn/api/durl/BV1Ya411p7Z5?p=1`（302 → Deno mp4，原生播放器）。
2. **核心Bug：手机打开"合集链接"时，先黑屏停几秒没播放，然后自动跳到/变成"第一集链接"播放。** 页面最终表现成单集播放器（只有一个视频，无法选集、无法连播）。
3. 用户原话（多个版本）："合集不能播放 自动跳转第一集的网址播放 只能播一集 不能连播选集"、"合集和第一集播放器都不一样"。
4. 电脑端合集能正常选集+连播；手机端单集直链能播；**唯独手机端合集集合不能选集连播**。
5. "其他浏览器只有声音没有画面" = HEVC (hev1) 轨问题，已在 `/api/mpd` 修复（避开 hev1 用 avc1/av01）。

## 播放逻辑（当前代码 `/app/play/[id]/page.tsx`）
- `load()`：若 `id` 是 BV 号 → `loadVideo`；否则 fetch `/api/articles/[id]`，解析 `content.videos`（>1 集 → 选集UI + 播第一集）。
- `loadVideo` → durl 模式：`resolveDurl()` 拿 `/api/durl/bvid?p=N&json=1` 的 Deno 直链 → `video.src`。
- **疑点**：如果 `content.videos` 解析不出合集（数组只有 1 个/为空），会 fallback 到 `bilibili_url` 单集，导致变成"第一集播放器"。需确认该文章 content 是否真的是 37 集 videos。

## 注意
- 用户不允许我再反复问问题。遇到不确定的，先自己读代码/查线上数据/实测，能确定就直接修。

## 已定位根因并修复（2026-08，deploy aa6bc7c）
- **根因1**：`app/play/[id]/page.tsx` 手机端原逻辑先走 durl 完整 mp4（38MB 大文件），Deno 代理慢（~17KB/s），38MB 加载不出 → 黑屏卡死、切集闪跳、退化成"单集播放器"（功能标签只剩原生播放器，无法选集连播）。
- **根因2**：`player.initialize(v, mpdUrl, false)` 的 autoplay=false，手机端首集黑屏不自动播。
- **修复**：手机端（isMobile）直接走 dash.js + MPD（H.264 小分片、最兼容），跳过 durl；dash 初始化 autoplay=true + streamInitialized/canPlay 时 tryAutoplay；ABR 开自动降码率（video maxBitrate 200000 → 480p/360p）抗慢网。
- **验证**（Edge headless 手机UA + 慢速网络模拟）：手机端合集自动播放 ✓、底部选集横条切集 ✓、稳定不卡 ✓。打开合集链接就是合集播放器（剧集(37)/连播/底部选集横条），不跳单集播放器。
## 额度教训（2026-08，用户反馈 Deno 额度烧到 90%，严重！）
- **绝对教训**：dash.js 分片播放每个分片都走 Deno 代理（`/proxy?u=`），一集 300+ 次 Deno 请求，直接烧光免费额度（1万/月）。durl 完整 mp4 仅 1-2 次/视频。
- **正确策略**：所有设备 durl 优先（360p 完整 mp4，`?json=1` 直连保持 Range，浏览器流式渐进播放）；dash.js 只在 durl 多次失败后兜底。**永远不要把手机端默认设为 dash.js。**
- **手机端"黑屏/卡"根因是 Deno 慢（~17KB/s）+ 38MB 大文件加载不出**，不是播放方式问题；durl 是唯一省额度选项，接受 360p 画质。
- 用户核心诉求排序：**省额度 > 能看**。绝不能再让播放方式烧额度。
<!-- END:合集播放bug-2026-08 -->
