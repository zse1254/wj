import { query } from '@/lib/db'

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
    return Response.json({ success: true, data: articles[0] })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
