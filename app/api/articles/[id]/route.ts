import { query } from '@/lib/db'

async function withCategories(article: Record<string, unknown>) {
  const rows = await query('SELECT category_id FROM article_categories WHERE article_id = ?', [article.id])
  return { ...article, category_ids: rows.map(r => r.category_id) }
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
    return Response.json({ success: true, data: await withCategories(articles[0]) })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
