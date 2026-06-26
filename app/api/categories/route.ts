import { query } from '@/lib/db'

export async function GET() {
  try {
    const categories = await query('SELECT * FROM categories ORDER BY name')
    return Response.json({ success: true, data: categories })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
