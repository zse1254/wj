'use client'

import Link from 'next/link'
import type { Article } from '@/lib/types'

const typeConfig: Record<string, { label: string; icon: string }> = {
  article: { label: '文章', icon: '📄' },
  video: { label: '视频', icon: '🎬' },
  audio: { label: '音频', icon: '🎧' },
}

export default function ArticleCard({ article }: { article: Article }) {
  const href = `/${article.type}/${article.id}`
  const cfg = typeConfig[article.type] || { label: '未知', icon: '📄' }

  return (
    <Link href={href} className="group block bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-gray-200 hover:-translate-y-0.5">
      {article.cover_image ? (
        <div className="relative aspect-video bg-gray-100 overflow-hidden">
          <img
            src={article.cover_image}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <span className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span>{cfg.icon}</span>
            <span>{cfg.label}</span>
          </span>
        </div>
      ) : (
        <div className="relative aspect-video bg-gradient-to-br from-[#1a4a7a] to-[#0d2b4a] flex items-center justify-center">
          <span className="text-4xl opacity-30">{cfg.icon}</span>
          <span className="absolute bottom-2 left-2 bg-white/20 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span>{cfg.icon}</span>
            <span>{cfg.label}</span>
          </span>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {article.category_name && (
            <span className="text-xs text-[#1a73e8] bg-blue-50 px-2 py-0.5 rounded-full font-medium">{article.category_name}</span>
          )}
        </div>
        <h3 className="font-semibold text-[15px] leading-snug line-clamp-2 mb-1.5 text-gray-900 group-hover:text-[#1a73e8] transition-colors">{article.title}</h3>
        {article.summary && (
          <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">{article.summary}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
          <span>{new Date(article.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          {article.author && <span>{article.author}</span>}
        </div>
      </div>
    </Link>
  )
}
