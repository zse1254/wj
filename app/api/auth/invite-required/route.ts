import { query } from '@/lib/db'

export async function GET() {
  try {
    const setting = await query("SELECT value FROM settings WHERE key = 'invite_required'")
    const required = setting.length > 0 && setting[0].value === '1'
    return Response.json({ success: true, required })
  } catch {
    return Response.json({ success: true, required: false })
  }
}
