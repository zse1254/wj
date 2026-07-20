import { query } from '@/lib/db'

function sanitize(article: Record<string, unknown>) {
  const { stream_data, stream_expires_at, ...rest } = article
  const hasStream = !!(stream_data && stream_expires_at && new Date(stream_expires_at as string) > new Date())
  return { ...rest, has_stream: hasStream } as any
}

export async function GET(
  _request: Request,
  context: RouteContext<'/api/articles/[id]'>
) {
  try {
    const { id } = await context.params
    const articles = await query(
      `SELECT a.*, c.name as category_name
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.id = ? AND a.published = 1`,
      [id]
    )
    if (articles.length === 0) {
      return Response.json({ success: false, error: 'Article not found' }, { status: 404 })
    }
    const rows = await query('SELECT category_id FROM article_categories WHERE article_id = ?', [articles[0].id])
    return Response.json({ success: true, data: { ...sanitize(articles[0]), category_ids: rows.map(r => r.category_id) } })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
