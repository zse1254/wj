import { query } from '@/lib/db'

const PUBLIC_KEYS = ['footer_text', 'site_slogan', 'site_subtitle', 'seo_title', 'seo_description', 'seo_keywords', 'contact_text', 'contact_qrcode', 'space_enabled']

export async function GET() {
  try {
    await query('SELECT 1 FROM settings LIMIT 1').catch(() => {})
    const rows = await query('SELECT key, value FROM settings')
    const data: Record<string, string> = {}
    for (const r of rows) {
      if (PUBLIC_KEYS.includes(String(r.key))) data[String(r.key)] = String(r.value ?? '')
    }
    return Response.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
