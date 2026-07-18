'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { extractBilibiliBvid, parseBilibiliHtml } from '@/lib/bilibili'

interface BilibiliVideo {
  bvid: string
  title: string
  cover_url: string
}

export default function NewArticlePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string }[]>([])
  const [form, setForm] = useState({
    title: '',
    summary: '',
    content: '',
    type: 'article',
    cover_image: '',
    video_url: '',
    audio_url: '',
    bilibili_url: '',
    is_m3u8: false,
    category_id: '',
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
        router.push('/admin/articles')
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
    for (const v of videos) {
      try {
        await fetch('/api/admin/articles', {
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
            bilibili_url: `https://www.bilibili.com/video/${v.bvid}`,
            is_m3u8: false,
            category_id: form.category_id,
            published: form.published,
          }),
        })
        count++
      } catch {}
      setBatchProgress(Math.round(((count) / videos.length) * 100))
    }
    setBatchSaving(false)
    alert(`已成功添加 ${count} 个视频`)
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
            <label className="block text-sm font-medium mb-1">分类</label>
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none">
              <option value="">无分类</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {form.type === 'video' && (
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
            立即发布
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

      {seriesInfo && (
        <div className="mt-6 bg-white rounded-xl border p-6 max-w-3xl">
          <h2 className="text-lg font-bold mb-1">检测到合集：{seriesInfo.title}</h2>
          <p className="text-sm text-gray-500 mb-3">共 {seriesInfo.videos.length} 个视频</p>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button type="button" onClick={() => {
              const videosJson = JSON.stringify({ videos: seriesInfo.videos.map(v => ({ bvid: v.bvid, title: v.title, cover_url: v.cover_url })) })
              setForm(f => ({
                ...f,
                type: 'series',
                title: seriesInfo.title,
                cover_image: f.cover_image || seriesInfo.videos[0]?.cover_url || '',
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
                <img src={v.cover_url} alt="" className="w-16 h-10 object-cover rounded shrink-0" />
                <span className="text-sm truncate">{v.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
