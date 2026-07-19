'use client'

import { useState } from 'react'

interface SpacePost {
  id: string
  bvid: string
  title: string
  cover_image: string
  duration: number
  created_at: string
  bilibili_url: string
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isBilibili(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host.endsWith('bilibili.com') || host === 'b23.tv'
  } catch {
    return false
  }
}

export default function SpacePostCard({ post }: { post: SpacePost }) {
  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const embed = `https://player.bilibili.com/player.html?bvid=${post.bvid}&high_quality=1&autoplay=1&danmaku=0`
  const fromBili = isBilibili(post.bilibili_url)

  const handleReport = async () => {
    const reason = prompt('请填写举报理由（如侵权/违规）：')
    if (reason === null) return
    setReporting(true)
    try {
      await fetch('/api/spaces/posts/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, reason }),
      })
      alert('已收到举报，管理员会尽快处理')
    } catch {
      alert('提交失败，请稍后再试')
    } finally {
      setReporting(false)
    }
  }

  return (
    <>
      <div className="group block w-full bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-gray-200 hover:-translate-y-0.5">
        <button onClick={() => setOpen(true)} className="block w-full text-left">
          {post.cover_image ? (
            <div className="relative aspect-video bg-gray-100 overflow-hidden">
              <img src={post.cover_image} alt={post.title} loading="lazy" referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-[#1a73e8] text-xl shadow-lg">▶</span>
              </span>
              {post.duration > 0 && (
                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">{formatDuration(post.duration)}</span>
              )}
            </div>
          ) : (
            <div className="relative aspect-video bg-gradient-to-br from-[#1a4a7a] to-[#0d2b4a] flex items-center justify-center">
              <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-[#1a73e8] text-xl shadow-lg">▶</span>
            </div>
          )}
        </button>
        <div className="p-4">
          <h3 className="font-semibold text-[15px] leading-snug line-clamp-2 mb-1.5 text-gray-900">{post.title}</h3>
          <div className="flex items-center justify-between gap-2 text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
            <span>来自 {fromBili ? 'Bilibili' : '用户分享'}</span>
            <div className="flex items-center gap-3">
              {fromBili && (
                <a href={post.bilibili_url} target="_blank" rel="noopener noreferrer"
                  className="text-[#1a73e8] hover:underline" onClick={e => e.stopPropagation()}>在 B 站观看</a>
              )}
              <button onClick={e => { e.stopPropagation(); handleReport() }} disabled={reporting}
                className="text-gray-400 hover:text-red-500 disabled:opacity-50">举报</button>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white text-sm font-medium line-clamp-1 pr-4">{post.title}</h3>
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-2xl leading-none shrink-0">×</button>
            </div>
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <iframe src={embed} scrolling="no" frameBorder="0" allowFullScreen referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                className="absolute inset-0 w-full h-full border-0" />
            </div>
            <div className="flex items-center justify-center gap-4 mt-2">
              <p className="text-white/50 text-xs">内容由用户分享，版权归 UP 主所有</p>
              {fromBili && (
                <a href={post.bilibili_url} target="_blank" rel="noopener noreferrer"
                  className="text-white/80 hover:text-white text-xs underline">在 B 站观看原视频</a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
