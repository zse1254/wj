'use client'

import { useState } from 'react'

interface SpacePost {
  id: string
  bvid: string
  title: string
  cover_image: string
  duration: number
  created_at: string
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function SpacePostCard({ post }: { post: SpacePost }) {
  const [open, setOpen] = useState(false)
  const embed = `https://player.bilibili.com/player.html?bvid=${post.bvid}&high_quality=1&autoplay=1&danmaku=0`
  const cover = post.cover_image || `https://api.bilibili.com/x/web-interface/view?bvid=${post.bvid}`

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group block w-full text-left bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-gray-200 hover:-translate-y-0.5"
      >
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
        <div className="p-4">
          <h3 className="font-semibold text-[15px] leading-snug line-clamp-2 mb-1.5 text-gray-900 group-hover:text-[#1a73e8] transition-colors">{post.title}</h3>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
            <span>来自 Bilibili</span>
          </div>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white text-sm font-medium line-clamp-1 pr-4">{post.title}</h3>
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-2xl leading-none shrink-0">×</button>
            </div>
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <iframe src={embed} scrolling="no" frameBorder="0" allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-presentation"
                className="absolute inset-0 w-full h-full border-0" />
            </div>
            <p className="text-white/50 text-xs mt-2 text-center">内容由用户分享，版权归 UP 主所有</p>
          </div>
        </div>
      )}
    </>
  )
}
