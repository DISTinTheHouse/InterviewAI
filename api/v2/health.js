const { getSupabaseAdmin } = require('../../lib/supabase-admin');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('interviewai_invites').select('id', { head: true, count: 'exact' });
    if (error) return res.status(503).json({ ok: false, service: 'database', code: error.code || 'QUERY_FAILED' });
    return res.status(200).json({ ok: true, service: 'interviewai-v2' });
  } catch {
    return res.status(503).json({ ok: false, service: 'configuration' });
  }
};
