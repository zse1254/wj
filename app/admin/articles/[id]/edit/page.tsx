'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type BilibiliVideo, fetchBilibiliViewJsonp } from '@/lib/bilibili'
import { fixCoverUrl } from '@/lib/deno-proxy'

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
  // 播放页的版本参数：每次进入/渲染都生成新随机数，
  // 让手机浏览器拿到的链接每次都不同 → 强制加载最新播放器 JS，绕过旧缓存
  const [playVer, setPlayVer] = useState(() => Math.floor(Math.random() * 1e9))

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
        if (a.type === 'series' && a.content) {
          try {
            const parsed = JSON.parse(a.content)
            if (Array.isArray(parsed.videos) && parsed.videos.length > 0) {
              setSeriesInfo({ title: a.title || parsed.title || '', videos: parsed.videos })
            }
          } catch {}
        }
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
        type: series ? 'series' : f.type,
      }))
      if (series) setSeriesInfo(series)
      setFetching(false)
    }

    const bvid = url.match(/BV[a-zA-Z0-9]+/)?.[0]

    // 0) 首选：浏览器本地直连 B站 view API（JSONP，用户本地 IP，不经 CF/Deno）
    //    JSONP 用 <script> 加载，绕过 CORS；B站 对本地 IP 不封 412。
    //    返回分P准确时长，直接构建合集，不再需要 Deno 补齐 duration。
    //    数据在保存文章时写入 CF 数据库（D1）。
    if (bvid) {
      try {
        const json = await fetchBilibiliViewJsonp(bvid)
        if (json?.code === 0 && json?.data) {
          const d = json.data
          const pages: any[] = Array.isArray(d.pages) ? d.pages : []
          const video = { title: d.title || '', description: (d.desc || '').slice(0, 500), cover_url: d.pic || '' }
          let series: typeof seriesInfo = null
          if (pages.length >= 1) {
            series = {
              title: d.title || '合集',
              videos: pages.map(p => ({
                bvid: d.bvid || bvid, title: p.part || `第${p.page}集`,
                cover_url: fixCoverUrl(d.pic || ''), page: p.page, duration: p.duration || 0, cid: p.cid,
                description: '',
              })),
            }
          }
          fill(video, series)
          return
        }
      } catch {}
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
            发布到网站
          </label>
          <div className="flex gap-3 ml-auto">
            {form.type === 'series' && form.bilibili_url && (
              <button type="button" onClick={() => {
                if (!confirm('从 B 站重新抓取合集数据，替换当前内容？')) return
                fetch(`/api/admin/articles/${params.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...form, content: '' }),
                }).then(r => r.json()).then(res => {
                  if (res.success) { alert('已修复，刷新页面'); location.reload() }
                  else alert(res.error || '修复失败')
                })
              }}
                className="text-sm text-amber-600 hover:underline px-2">
                🔄 修复合集
              </button>
            )}
            <button type="button" onClick={() => router.back()} className="px-4 py-2 border rounded-lg text-sm">取消</button>
            <button type="submit" disabled={saving}
              className="bg-[#1a73e8] text-white px-6 py-2 rounded-lg text-sm hover:bg-[#1557b0] disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {(form.type === 'video' || form.type === 'series') && form.bilibili_url && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm space-y-2">
            {/* 合集直链 = 网页播放页：合集只有一个链接，能选集+连播（这是主链接） */}
            <div className={form.type === 'series' ? 'p-2 bg-green-600 rounded-lg space-y-1.5' : 'space-y-1.5'}>
              <div className="font-semibold text-white">
{form.type === 'series' ? '👉 合集直链（就这一个链接，看全集、能选集、自动连播）' : '网页播放页'}
            </div>
            {!form.published && (
              <p className="text-[11px] text-amber-200 bg-amber-600/30 px-2 py-1 rounded mt-1">未发布：主页/列表不显示，仅凭此链接可访问播放页（无站点导航）。</p>
            )}
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/play/${params.id}?v=${playVer}`}
                  className="flex-1 px-2 py-1 bg-white border rounded text-xs font-mono" onClick={e => (e.target as HTMLInputElement).select()} />
                <button type="button" onClick={() => {
                  const url = `${window.location.origin}/play/${params.id}?v=${playVer}`
                  navigator.clipboard.writeText(url).then(() => alert('已复制（链接带版本号，绕过旧缓存，手机打开即最新版合集播放器）')).catch(() => alert('复制失败'))
                }}
                  className="px-3 py-1 bg-white text-green-700 border border-green-300 rounded hover:bg-green-50 text-xs shrink-0">
                  复制
                </button>
              </div>
              {form.type === 'series' && (
                <p className="text-[10px] text-green-100">手机/电脑浏览器直接打开，官方极简播放器（无B站痕迹、无广告、不耗代理额度），底部有选集横条、可自动连播。</p>
              )}
            </div>
          </div>
        )}
      </form>
      {seriesInfo && (
        <div className="mt-6 bg-white rounded-xl border p-6 max-w-3xl">
          <h2 className="text-lg font-bold mb-1">检测到合集：{seriesInfo.title}</h2>
          <p className="text-sm text-gray-500 mb-3">共 {seriesInfo.videos.length} 个视频</p>
          <button type="button" onClick={() => {
            if (!seriesInfo || !Array.isArray(seriesInfo.videos)) { alert('合集数据无效'); return }
            const valid = seriesInfo.videos.filter(v => v && v.bvid)
            if (valid.length === 0) { alert('合集无有效视频'); return }
            let existingDurations: Record<string, number> = {}
            try { const c = JSON.parse(form.content || '{}'); if (Array.isArray(c.videos)) { c.videos.forEach((v: any, i: number) => { if (v.duration) existingDurations[i] = v.duration }) } } catch {}
            const videosJson = JSON.stringify({ videos: valid.map((v, i) => ({ bvid: v.bvid, title: v.title, cover_url: v.cover_url, page: v.page, duration: v.duration || existingDurations[i] || undefined })) })
            setForm(f => ({ ...f, type: 'series', content: videosJson, cover_image: f.cover_image || valid[0]?.cover_url || '' }))
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
