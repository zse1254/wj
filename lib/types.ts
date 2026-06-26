export type ArticleType = 'article' | 'video' | 'audio'

export interface Article {
  id: string
  title: string
  content: string
  summary: string
  cover_image: string | null
  type: ArticleType
  video_url: string | null
  audio_url: string | null
  bilibili_url: string | null
  is_m3u8: boolean
  category_id: string | null
  category_name: string | null
  published: boolean
  author_id: string | null
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  username: string
  email: string
  password_hash: string
  is_admin: boolean
  is_vip: boolean
  vip_expires_at: string | null
  created_at: string
}

export interface VipCard {
  id: string
  code: string
  duration_days: number
  is_used: boolean
  used_by: string | null
  used_at: string | null
  created_by: string
  created_at: string
}

export interface Category {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface JWTPayload {
  userId: string
  isAdmin: boolean
}
