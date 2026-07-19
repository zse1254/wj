import { NextRequest } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const type = searchParams.get('type')
    const category = searchParams.get('category')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    let sql = `
      SELECT a.*, c.name as category_name
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.published = 1
    `
    const params: unknown[] = []

    if (type) {
      sql += ' AND a.type = ?'
      params.push(type)
    }
    if (category) {
      sql += ' AND (c.slug = ? OR a.id IN (SELECT ac.article_id FROM article_categories ac JOIN categories cc ON cc.id = ac.category_id WHERE cc.slug = ?))'
      params.push(category, category)
    }

    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const articles = await query(sql, params)

    let countSql = 'SELECT COUNT(*) as total FROM articles WHERE published = 1'
    const countParams: unknown[] = []
    if (type) {
      countSql += ' AND type = ?'
      countParams.push(type)
    }
    if (category) {
      countSql += ' AND (category_id IN (SELECT id FROM categories WHERE slug = ?) OR id IN (SELECT ac.article_id FROM article_categories ac JOIN categories cc ON cc.id = ac.category_id WHERE cc.slug = ?))'
      countParams.push(category, category)
    }
    const countResult = await query(countSql, countParams)
    const total = countResult[0]?.total as number || 0

    return Response.json({ success: true, data: { articles, total, page, limit } })
  } catch (err) {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
