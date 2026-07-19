import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { articleId, reason } = await request.json()
    if (!articleId) return Response.json({ success: false, error: 'Missing articleId' }, { status: 400 })
    const articles = await query('SELECT id FROM articles WHERE id = ?', [articleId])
    if (articles.length === 0) return Response.json({ success: false, error: '内容不存在' }, { status: 404 })

    try {
      await execute('CREATE TABLE IF NOT EXISTS article_reports (id TEXT PRIMARY KEY, article_id TEXT, reporter_id TEXT, reason TEXT, created_at TEXT DEFAULT (datetime(\'now\')), FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE)', [])
    } catch {}

    const id = uuidv4()
    await execute(
      'INSERT INTO article_reports (id, article_id, reporter_id, reason) VALUES (?, ?, ?, ?)',
      [id, articleId, user.userId, (reason || '').toString().slice(0, 500)]
    )
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}
