'use client'

import Link from 'next/link'
import type { Article } from '@/lib/types'

const typeLabels: Record<string, string> = {
  article: '文章',
  video: '视频',
  audio: '音频',
}

const typeIcons: Record<string, string> = {
  article: '📄',
  video: '🎬',
  audio: '🎧',
}

export default function ArticleCard({ article }: { article: Article }) {
  const href = `/${article.type}/${article.id}`

  return (
    <Link href={href} className="block bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100">
      {article.cover_image && (
        <div className="relative aspect-video bg-gray-100 overflow-hidden">
          <img
            src={article.cover_image}
            alt={article.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <span className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
            <span>{typeIcons[article.type]}</span>
            <span>{typeLabels[article.type]}</span>
          </span>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {!article.cover_image && (
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
              <span>{typeIcons[article.type]}</span>
              <span>{typeLabels[article.type]}</span>
            </span>
          )}
          {article.category_name && (
            <span className="text-xs text-[#1a73e8] bg-blue-50 px-2 py-0.5 rounded">{article.category_name}</span>
          )}
        </div>
        <h3 className="font-medium text-base leading-snug line-clamp-2 mb-1">{article.title}</h3>
        {article.summary && (
          <p className="text-sm text-gray-500 line-clamp-2">{article.summary}</p>
        )}
        <div className="text-xs text-gray-400 mt-2">
          {new Date(article.created_at).toLocaleDateString('zh-CN')}
        </div>
      </div>
    </Link>
  )
}
