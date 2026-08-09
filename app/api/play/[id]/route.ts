import { query } from '@/lib/db'

// 直链播放页数据源：不区分发布状态。
// 文章 id 为随机 UUID，直链本身即访问凭证——未发布文章不进入任何站点页面/列表，
// 只有拿到此直链的人可以访问播放页（无站点导航、无品牌信息）。
export async function GET(
  _request: Request,
  context: RouteContext<'/api/play/[id]'>
) {
  try {
    const { id } = await context.params
    const rows = await query(
      `SELECT a.*, c.name as category_name
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.id = ?`,
      [id]
    )
    if (rows.length === 0) {
      return Response.json({ success: false, error: 'Article not found' }, { status: 404 })
    }
    const a = rows[0]
    const { stream_data, stream_expires_at, ...rest } = a
    let category_ids: string[] = []
    try {
      const catRows = await query('SELECT category_id FROM article_categories WHERE article_id = ?', [id])
      category_ids = catRows.map(r => r.category_id as string)
    } catch {}
    return Response.json({ success: true, data: { ...rest, category_ids } })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}