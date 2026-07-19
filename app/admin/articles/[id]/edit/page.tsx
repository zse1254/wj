'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type BilibiliVideo, parseBilibiliHtml } from '@/lib/bilibili'

export default function EditArticlePage() {
  const router = useRouter()
  const params = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string; parent_id: string | null }[]>([])
  const [form, setForm] = useState({
    title: '', summary: '', content: '', type: 'video',
    cover_image: '', video_url: '', audio_url: '', bilibili_url: '',
    is_m3u8: false, category_id: '', category_ids: [] as string[], published: true,
  })
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [seriesInfo, setSeriesInfo] = useState<{ title: string; videos: BilibiliVideo[] } | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch(`/api/admin/articles/${params.id}`).then(r => r.json()),
    ]).then(([catRes, artRes]) => {
      if (catRes.success) setCategories(catRes.data)
      if (artRes.success) {
        const a = artRes.data
        setForm({
          title: a.title || '', summary: a.summary || '', content: a.content || '',
          type: a.type || 'article', cover_image: a.cover_image || '',
          video_url: a.video_url || '', audio_url: a.audio_url || '',
          bilibili_url: a.bilibili_url || '', is_m3u8: Boolean(a.is_m3u8),
          category_id: a.category_id || '', published: Boolean(a.published),
          category_ids: Array.isArray(a.category_ids) ? a.category_ids : [],
        })
      }
    }).finally(() => setLoading(false))
  }, [params.id])

  const fetchBilibiliInfo = useCallback(async (url: string) => {
    setFetchError('')
    setSeriesInfo(null)
    if (!url || !url.includes('bilibili')) return
    setFetching(true)

    const fill = (v: { title: string; description?: string; cover_url?: string }, series?: typeof seriesInfo) => {
      setForm(f => ({
        ...f,
        title: f.title === f.bilibili_url ? v.title : f.title,
        summary: f.summary || v.description || '',
        cover_image: f.cover_image || v.cover_url || '',
      }))
      if (series) setSeriesInfo(series)
      setFetching(false)
    }

    // 1) Server-side (returns exact durations if CF IP not blocked)
    try {
      const res = await fetch('/api/admin/bilibili', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (data.success) {
        fill(data.data.video, data.data.series ? { title: data.data.series.title, videos: data.data.series.videos } : null)
        return
      }
    } catch {}

    const bvid = url.match(/BV[a-zA-Z0-9]+/)?.[0]

    // 2) Deno Deploy proxy (does NOT return per-page duration, so we'll supplement after)
    let seriesFromDeno: typeof seriesInfo = null
    let videoFromDeno: { title: string; description?: string; cover_url?: string } | null = null
    try {
      const denoRes = await fetch('https://rustic-mayfly-8854.zse1254.deno.net', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(15000),
      })
      const denoData = await denoRes.json()
      if (denoData.success) {
        videoFromDeno = { title: denoData.data.video.title || '', description: (denoData.data.video.description || '').slice(0, 500), cover_url: denoData.data.video.cover_url || '' }
        if (denoData.data.series) {
          seriesFromDeno = { title: denoData.data.series.title, videos: denoData.data.series.videos }
        }
      }
    } catch {}

    // 3) Supplement per-page durations via client-side Bilibili API fetch (user's China IP)
    if (bvid && seriesFromDeno) {
      try {
        const c = new AbortController()
        const t = setTimeout(() => c.abort(), 8000)
        const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
          mode: 'cors',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.bilibili.com' },
          signal: c.signal,
        }).finally(() => clearTimeout(t))
        if (res.ok) {
          const json = await res.json()
          if (json.code === 0 && json.data?.pages?.length) {
            const pagesByPage: Record<number, number> = {}
            for (const p of json.data.pages) { pagesByPage[p.page] = p.duration || 0 }
            seriesFromDeno = {
              title: seriesFromDeno.title,
              videos: seriesFromDeno.videos.map(v => ({
                ...v,
                duration: v.duration || pagesByPage[v.page || 0] || 0,
              })),
            }
          }
        }
      } catch {}
    }

    // 3b) CORS proxies — fetch HTML page, parse __INITIAL_STATE__ for per-page durations
    if (bvid && seriesFromDeno) {
      const pageUrl = `https://www.bilibili.com/video/${bvid}`
      const proxies = [
        (u: string) => `https://api.allorigins.cn/raw?url=${encodeURIComponent(u)}`,
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u: string) => `https://api.allorigins.io/raw?url=${encodeURIComponent(u)}`,
      ]
      for (const buildProxy of proxies) {
        try {
          const c = new AbortController()
          const t = setTimeout(() => c.abort(), 8000)
          const proxyRes = await fetch(buildProxy(pageUrl), { signal: c.signal }).finally(() => clearTimeout(t))
          if (!proxyRes.ok) continue
          const html = await proxyRes.text()
          const parsed = parseBilibiliHtml(html, bvid)
          if (parsed.series?.videos?.length) {
            const byIndex: Record<number, number> = {}
            parsed.series.videos.forEach((v, i) => { if (v.duration) byIndex[i] = v.duration })
            if (Object.keys(byIndex).length > 0) {
              seriesFromDeno = {
                title: seriesFromDeno.title,
                videos: seriesFromDeno.videos.map((v, i) => ({ ...v, duration: v.duration || byIndex[i] || 0 })),
              }
              break
            }
          }
        } catch { continue }
      }
    }

    if (videoFromDeno) {
      fill(videoFromDeno, seriesFromDeno)
      return
    }

    // 4) Last resort: direct browser fetch to Bilibili API (no series info)
    if (bvid) {
      try {
        const c = new AbortController()
        const t = setTimeout(() => c.abort(), 8000)
        const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
          mode: 'cors',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.bilibili.com' },
          signal: c.signal,
        }).finally(() => clearTimeout(t))
        if (res.ok) {
          const json = await res.json()
          if (json.code === 0 && json.data) {
            const v = json.data
            let series = null as typeof seriesInfo
            if (v.pages?.length > 1) {
              series = { title: v.title || '', videos: v.pages.map((p: any) => ({ bvid: v.bvid, title: p.part || `第${p.page}集`, cover_url: v.pic || '', page: p.page, duration: p.duration || 0 })) }
            }
            fill({ title: v.title || '', description: (v.desc || '').slice(0, 500), cover_url: v.pic || '' }, series)
            return
          }
        }
      } catch {}
    }

    setFetchError('Bilibili page error: 412')
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
      const res = await fetch(`/api/admin/articles/${params.id}`, {
        method: 'PUT',
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

  const topCategories = categories.filter(c => !c.parent_id)
  const childOf = (pid: string | null) => categories.filter(c => c.parent_id === pid)

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">编辑内容</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-5 max-w-3xl">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">标题 *</label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">类型</label>
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
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">主分类</label>
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none">
              <option value="">无分类</option>
              {topCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">所属分类（可多选）</label>
          <div className="flex flex-col gap-3">
            {topCategories.map(parent => (
              <div key={parent.id}>
                <p className="text-xs text-gray-400 mb-1.5 font-medium">{parent.name}</p>
                <div className="flex flex-wrap gap-2">
                  {childOf(parent.id).map(c => {
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
                        {c.name}
                      </button>
                    )
                  })}
                  {childOf(parent.id).length === 0 && <span className="text-xs text-gray-300">（无子分类）</span>}
                </div>
              </div>
            ))}
            {topCategories.length === 0 && <span className="text-sm text-gray-400">暂无可选分类</span>}
          </div>
        </div>

        {(form.type === 'video' || form.type === 'series') && (
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium mb-1">Bilibili 链接</label>
              <div className="flex gap-2">
                <input type="url" value={form.bilibili_url} onChange={handleBilibiliUrlChange}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none"
                  placeholder="粘贴 Bilibili 链接自动获取信息" />
                {fetching && <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mt-2.5" />}
              </div>
              {fetchError && <p className="text-red-500 text-xs mt-1">{fetchError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">视频 URL</label>
                <input type="url" value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
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
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
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
            已发布
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
          <button type="button" onClick={() => {
            // Preserve existing durations from content if fetched series lacks them
            let existingDurations: Record<string, number> = {}
            try { const c = JSON.parse(form.content || '{}'); if (Array.isArray(c.videos)) { c.videos.forEach((v: any, i: number) => { if (v.duration) existingDurations[i] = v.duration }) } } catch {}
            const videosJson = JSON.stringify({ videos: seriesInfo.videos.map((v, i) => ({ bvid: v.bvid, title: v.title, cover_url: v.cover_url, page: v.page, duration: v.duration || existingDurations[i] || undefined })) })
            setForm(f => ({ ...f, type: 'series', content: videosJson, cover_image: f.cover_image || seriesInfo.videos[0]?.cover_url || '' }))
          }}
            className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-purple-700">
            📺 保存为合集
          </button>
          <div className="max-h-60 overflow-y-auto space-y-2 mt-3">
            {seriesInfo.videos.map((v, i) => (
              <div key={v.bvid + (v.page || '')} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                {v.cover_url && <img src={v.cover_url} alt="" className="w-14 h-9 object-cover rounded shrink-0" referrerPolicy="no-referrer" />}
                <span className="text-sm truncate">{i + 1}. {v.title}</span>
              </div>
            ))}
          </div>
          {form.type === 'series' && <p className="text-xs text-green-600 mt-2">✅ 已选择合集类型，点下方「保存」提交。</p>}
        </div>
      )}
    </div>
  )
}
