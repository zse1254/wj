import type { MetadataRoute } from 'next'
import { query } from '@/lib/db'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL || 'https://wj.pages.dev'
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  ]
  try {
    const rows = await query("SELECT id, type, updated_at, created_at FROM articles WHERE published = 1 OR published IS NULL")
    for (const r of rows) {
      const type = String(r.type || 'article')
      const date = new Date(String(r.updated_at || r.created_at || Date.now()))
      entries.push({ url: `${base}/${type}/${r.id}`, lastModified: date, changeFrequency: 'weekly', priority: 0.8 })
    }
  } catch {}
  return entries
}
