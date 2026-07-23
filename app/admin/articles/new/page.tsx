'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { extractBilibiliBvid, parseBilibiliHtml } from '@/lib/bilibili'

interface BilibiliVideo {
  bvid: string
  title: string
  cover_url: string
  page?: number
  duration?: number
  cid?: number
}

export default function NewArticlePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string; parent_id: string | null }[]>([])
  const [form, setForm] = useState({
    title: '',
    summary: '',
    content: '',
    type: 'video',
    cover_image: '',
    video_url: '',
    audio_url: '',
    bilibili_url: '',
    is_m3u8: false,
    category_id: '',
    category_ids: [] as string[],
    published: true,
  })
  const [fetching, setFetching] = useState(false)
  const [fetchAutoFailed, setFetchAutoFailed] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [seriesInfo, setSeriesInfo] = useState<{ title: string; videos: BilibiliVideo[] } | null>(null)
  const [selectedVideos, setSelectedVideos] = useState<Set<number>>(new Set())
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const [directLinks, setDirectLinks] = useState<{ video: { id: number; url: string; backup: string[]; codecs: string; width: number; height: number }[]; audio: { id: number; url: string; backup: string[]; codecs: string }[] } | null>(null)
  const [fetchingLinks, setFetchingLinks] = useState(false)
  const [lastSavedId, setLastSavedId] = useState('')

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(res => {
      if (res.success) setCategories(res.data)
    })
  }, [])

  const fetchBilibiliInfo = useCallback(async (url: string) => {
    setFetchError('')
    setFetchAutoFailed(false)
    setSeriesInfo(null)
    setSelectedVideos(new Set())
    if (!url || !url.includes('bilibili')) return
    setFetching(true)

    const bvid = extractBilibiliBvid(url)

    const fillForm = (v: { title: string; description?: string; cover_url?: string }) => {
      setForm(f => ({
        ...f,
        title: f.title || v.title,
        summary: f.summary || v.description || '',
        cover_image: f.cover_image || v.cover_url || '',
      }))
    }

    // 1) Server-side via Cloudflare Workers (enhanced headers)
    try {
      const res = await fetch('/api/admin/bilibili', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (data.success) {
        const v = data.data.video
        fillForm(v)
        if (data.data.series) {
          setSeriesInfo({
            title: data.data.series.title,
            videos: data.data.series.videos,
          })
          setSelectedVideos(new Set(data.data.series.videos.map((_: unknown, i: number) => i)))
        }
        setFetching(false)
        return
      }
    } catch {
      // fall through
    }

    if (!bvid) {
      setFetchError('无法识别 Bilibili 链接格式')
      setFetching(false)
      return
    }

    // 1b) Deno Deploy proxy (bypasses Cloudflare IP block)
    try {
      const denoRes = await fetch('https://rustic-mayfly-8854.zse1254.deno.net', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(15000),
      })
      const denoData = await denoRes.json()
      if (denoData.success) {
        fillForm(denoData.data.video)
        if (denoData.data.series) {
          setSeriesInfo({
            title: denoData.data.series.title,
            videos: denoData.data.series.videos,
          })
          setSelectedVideos(new Set(denoData.data.series.videos.map((_: unknown, i: number) => i)))
        }
        setFetching(false)
        return
      } else {
        console.warn('Deno proxy response error:', denoData.error)
      }
    } catch (e) {
      console.warn('Deno proxy fetch failed:', e)
    }

    // 2) Client-side — try fetching Bilibili page through CORS proxies
    //    (uses the user's browser IP, bypassing Cloudflare's blocked IPs)
    const pageUrl = `https://www.bilibili.com/video/${bvid}`
    const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
    const proxies = [
      // Generic CORS proxies
      (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      // China-friendly mirrors
      (u: string) => `https://api.allorigins.cn/raw?url=${encodeURIComponent(u)}`,
    ]

    for (const buildProxy of proxies) {
      try {
        const proxyRes = await fetch(buildProxy(pageUrl), { signal: AbortSignal.timeout(8000) })
        if (!proxyRes.ok) continue
        const html = await proxyRes.text()
        const parsed = parseBilibiliHtml(html, bvid)
        fillForm(parsed.video)
        if (parsed.series) {
          setSeriesInfo({
            title: parsed.series.title,
            videos: parsed.series.videos,
          })
          setSelectedVideos(new Set(parsed.series.videos.map((_: unknown, i: number) => i)))
        }
        setFetching(false)
        return
      } catch {
        continue
      }
    }

    // 3) Final attempt: direct browser fetch to Bilibili API (may be CORS-blocked,
    //    but some environments may allow it)
    try {
      const corsRes = await fetch(apiUrl, {
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com',
        },
      })
      if (corsRes.ok) {
        const json = await corsRes.json()
        if (json.code === 0 && json.data) {
          fillForm({
            title: json.data.title || '',
            description: (json.data.desc || '').slice(0, 500),
            cover_url: json.data.pic || '',
          })
          if (json.data.ugc_season?.id) {
            ;(async () => {
              const sRes = await fetch(`https://api.bilibili.com/x/web-interface/season/season?season_id=${json.data.ugc_season.id}`, {
                mode: 'cors',
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.bilibili.com' },
              })
              if (sRes.ok) {
                const sJson = await sRes.json()
                if (sJson.code === 0 && sJson.data?.episodes) {
                  const videos = sJson.data.episodes.map((ep: Record<string, unknown>) => ({
                    bvid: ep.bvid as string,
                    title: (ep.title as string) || '',
                    cover_url: (ep.cover as string) || '',
                  }))
                  setSeriesInfo({ title: sJson.data.title || '', videos })
                  setSelectedVideos(new Set(videos.map((_: unknown, i: number) => i)))
                }
              }
            })()
          }
          setFetching(false)
          return
        }
      }
    } catch {
      // fall through
    }

    // All attempts failed — auto-fill what we can (BVID, embed URL)
    setForm(f => ({
      ...f,
      bilibili_url: url,
    }))
    setFetchError('')
    setFetchAutoFailed(true)
    setFetching(false)
  }, [])

  const handleBilibiliUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setForm(f => ({ ...f, bilibili_url: val }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchBilibiliInfo(val), 600)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        const savedId = data.data?.id || ''
        setLastSavedId(savedId)
        // 自动获取直链（等待完成后才跳转）
        const bvid = extractBilibiliBvid(form.bilibili_url)
        if (bvid) {
          setFetchingLinks(true)
          try {
            const lr = await fetch('/api/admin/direct-links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bvid, page: 1 }),
            })
            const lj = await lr.json()
            if (lj.success) setDirectLinks(lj.data)
          } catch {}
          setFetchingLinks(false)
        }
        // 不再自动跳转，让用户看到直链后手动操作
      } else {
        alert(data.error || '保存失败')
      }
    } catch {
      alert('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const toggleVideo = (idx: number) => {
    setSelectedVideos(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  const handleBatchAdd = async () => {
    if (!seriesInfo) return
    const videos = seriesInfo.videos.filter((_, i) => selectedVideos.has(i))
    if (videos.length === 0) return
    setBatchSaving(true)
    setBatchProgress(0)
    let count = 0
    const createdIds: Record<string, string> = {}

    const seriesBody: any = {
      title: seriesInfo.title,
      summary: '',
      content: JSON.stringify(videos.map((v, i) => ({
        title: v.title, bvid: v.bvid, page: v.page, cid: v.cid, cover_url: v.cover_url, duration: v.duration,
        _idx: i, _id: '', // placeholder, filled after creation
      }))),
      type: 'series',
      cover_image: videos[0]?.cover_url || '',
      bilibili_url: videos[0]?.bvid ? `https://www.bilibili.com/video/${videos[0].bvid}` : '',
      category_id: form.category_id,
      published: form.published,
      video_url: '', audio_url: '', is_m3u8: false,
    }
    let seriesArticleId = ''
    try {
      const seriesRes = await fetch('/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seriesBody),
      })
      if (seriesRes.ok) {
        const sj = await seriesRes.json()
        seriesArticleId = sj.data?.id || ''
      }
    } catch {}

    for (const v of videos) {
      try {
        const res = await fetch('/api/admin/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: v.title,
            summary: '',
            content: '',
            type: 'video',
            cover_image: v.cover_url,
            video_url: '',
            audio_url: '',
            bilibili_url: `https://www.bilibili.com/video/${v.bvid}${v.page ? `?p=${v.page}` : ''}`,
            is_m3u8: false,
            category_id: form.category_id,
            published: form.published,
          }),
        })
        if (res.ok) {
          const j = await res.json()
          if (j.data?.id) {
            count++
            createdIds[String(v.page || count)] = j.data.id
          }
        }
      } catch {}
      setBatchProgress(Math.round(((count) / videos.length) * 100))
    }

    // 更新合集 article content，补上各分 P 的文章 UUID
    if (seriesArticleId && Object.keys(createdIds).length > 0) {
      try {
        const updated = videos.map((v) => ({
          title: v.title, bvid: v.bvid, page: v.page, cid: v.cid, cover_url: v.cover_url, duration: v.duration,
          article_id: createdIds[String(v.page || 0)] || '',
        }))
        await fetch(`/api/admin/articles/${seriesArticleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: JSON.stringify(updated),
            bilibili_url: `https://www.bilibili.com/video/${videos[0].bvid}`,
            cover_image: videos[0]?.cover_url || '',
          }),
        })
      } catch {}
    }

    setBatchSaving(false)
    alert(`已成功添加 ${count} 个视频${seriesArticleId ? ' + 合集索引' : ''}`)
    if (count > 0) router.push('/admin/articles')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">发布新内容</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-5 max-w-3xl">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">标题 *</label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">类型 *</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none">
              <option value="article">文章</option>
              <option value="video">视频</option>
              <option value="series">合集</option>
              <option value="audio">音频</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">摘要</label>
          <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none resize-none" rows={2} />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">封面图 URL</label>
            <input type="url" value={form.cover_image} onChange={e => setForm(f => ({ ...f, cover_image: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">主分类</label>
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none">
              <option value="">无分类</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">所属分类（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {categories.map(c => {
              const checked = form.category_ids.includes(c.id)
              return (
                <button type="button" key={c.id}
                  onClick={() => setForm(f => ({
                    ...f,
                    category_ids: checked ? f.category_ids.filter(x => x !== c.id) : [...f.category_ids, c.id],
                  }))}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    checked ? 'bg-[#1a73e8] text-white border-[#1a73e8]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {c.parent_id ? `└ ${c.name}` : c.name}
                </button>
              )
            })}
            {categories.length === 0 && <span className="text-sm text-gray-400">暂无可选分类</span>}
          </div>
        </div>

        {(form.type === 'video' || form.type === 'series') && (
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium mb-1">Bilibili 视频链接</label>
              <div className="flex gap-2">
                <input type="url" value={form.bilibili_url} onChange={handleBilibiliUrlChange}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none"
                  placeholder="粘贴 Bilibili 链接自动获取信息" />
                {fetching && <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mt-2.5" />}
              </div>
              {fetchError && <p className="text-red-500 text-xs mt-1">{fetchError}</p>}
              {fetchAutoFailed && !fetchError && !fetching && (
                <p className="text-yellow-600 text-xs mt-1">Bilibili 服务器封锁了自动获取，请手动填写标题、摘要和封面图</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">或直接视频 URL</label>
                <input type="url" value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" placeholder="https://..." />
              </div>
              <label className="flex items-center gap-2 mt-6 text-sm">
                <input type="checkbox" checked={form.is_m3u8} onChange={e => setForm(f => ({ ...f, is_m3u8: e.target.checked }))} />
                m3u8
              </label>
            </div>
          </div>
        )}

        {form.type === 'audio' && (
          <div>
            <label className="block text-sm font-medium mb-1">音频 URL</label>
            <input type="url" value={form.audio_url} onChange={e => setForm(f => ({ ...f, audio_url: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" placeholder="https://..." />
          </div>
        )}

        {form.type === 'article' && (
          <div>
            <label className="block text-sm font-medium mb-1">内容 (支持 HTML)</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none resize-none font-mono text-sm" rows={15} />
          </div>
        )}

        <div className="flex items-center gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} />
            发布到网站
          </label>
          <div className="flex gap-3 ml-auto">
            <button type="button" onClick={() => router.back()} className="px-4 py-2 border rounded-lg text-sm">取消</button>
            <button type="submit" disabled={saving}
              className="bg-[#1a73e8] text-white px-6 py-2 rounded-lg text-sm hover:bg-[#1557b0] disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </form>

      {lastSavedId && (
        <div className="mt-6 bg-white rounded-xl border p-6 max-w-3xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">B站 CDN 直链</h2>
            <div className="flex gap-2">
              <a href={`/play/${lastSavedId}`} target="_blank"
                className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">播放页</a>
              <a href={`/admin/articles/${lastSavedId}/edit`} target="_blank"
                className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">编辑页</a>
              <button type="button" onClick={() => router.push('/admin/articles')}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300">返回列表</button>
            </div>
          </div>
          {fetchingLinks && !directLinks && <p className="text-sm text-gray-500">正在从 B站 获取 CDN 直链...</p>}
          {!directLinks && !fetchingLinks && (
            <p className="text-sm text-yellow-600">未获取到直链{!form.bilibili_url ? '（未填写 Bilibili 链接）' : ''}</p>
          )}
          {directLinks && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">视频流</p>
                {directLinks.video.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 w-16 shrink-0">{v.height}p {v.codecs.split(',')[0]}</span>
                    <input type="text" readOnly value={v.url}
                      className="flex-1 px-2 py-1 bg-gray-50 border rounded text-xs font-mono" onClick={e => (e.target as HTMLInputElement).select()} />
                    <button type="button" onClick={() => navigator.clipboard.writeText(v.url).then(() => alert('已复制'))}
                      className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 shrink-0">复制</button>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">音频流</p>
                {directLinks.audio.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 w-16 shrink-0">{a.codecs.split(',')[0]}</span>
                    <input type="text" readOnly value={a.url}
                      className="flex-1 px-2 py-1 bg-gray-50 border rounded text-xs font-mono" onClick={e => (e.target as HTMLInputElement).select()} />
                    <button type="button" onClick={() => navigator.clipboard.writeText(a.url).then(() => alert('已复制'))}
                      className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 shrink-0">复制</button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">直链有时效性，过期需刷新。播放页: <a href={`/play/${lastSavedId}`} target="_blank" className="text-blue-500 hover:underline">{typeof window !== 'undefined' ? window.location.origin : ''}/play/{lastSavedId}</a></p>
            </div>
          )}
        </div>
      )}

      {seriesInfo && (
        <div className="mt-6 bg-white rounded-xl border p-6 max-w-3xl">
          <h2 className="text-lg font-bold mb-1">检测到合集：{seriesInfo.title}</h2>
          <p className="text-sm text-gray-500 mb-3">共 {seriesInfo.videos.length} 个视频</p>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button type="button" onClick={() => {
              if (!seriesInfo || !Array.isArray(seriesInfo.videos)) { alert('合集数据无效，请重新粘贴链接'); return }
              const valid = seriesInfo.videos.filter(v => v && v.bvid)
              if (valid.length === 0) { alert('合集无有效视频'); return }
              const videosJson = JSON.stringify({ videos: valid.map(v => ({ bvid: v.bvid, title: v.title, cover_url: v.cover_url, page: v.page, duration: v.duration })) })
              setForm(f => ({
                ...f,
                type: 'series',
                title: seriesInfo.title,
                cover_image: f.cover_image || valid[0]?.cover_url || '',
                summary: f.summary || '',
                content: videosJson,
              }))
            }}
              className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-purple-700">
              📺 创建合集（1 篇合集）
            </button>
            <span className="text-xs text-gray-400">或</span>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={selectedVideos.size === seriesInfo.videos.length}
                onChange={() => {
                  if (selectedVideos.size === seriesInfo.videos.length) {
                    setSelectedVideos(new Set())
                  } else {
                    setSelectedVideos(new Set(seriesInfo.videos.map((_, i) => i)))
                  }
                }} />
              全选
            </label>
            <button type="button" onClick={handleBatchAdd} disabled={batchSaving || selectedVideos.size === 0}
              className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {batchSaving ? `批量添加中 ${batchProgress}%` : `批量添加 (${selectedVideos.size})`}
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {seriesInfo.videos.map((v, i) => (
              <label key={v.bvid} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selectedVideos.has(i)} onChange={() => toggleVideo(i)} />
                <img src={v.cover_url} alt="" className="w-16 h-10 object-cover rounded shrink-0" referrerPolicy="no-referrer" />
                <span className="text-sm truncate">{v.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
