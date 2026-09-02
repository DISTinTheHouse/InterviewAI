const { getSupabaseAdmin } = require('../../lib/supabase-admin');

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });
  const token = String(req.query?.token || '').trim();
  if (!isUuid(token)) return res.status(400).json({ error: 'El enlace de entrevista no es válido.' });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('interviewai_invites')
      .select('id,token,label,expires_at,max_uses,use_count,active,job:interviewai_jobs(id,agency_id,title,department,location,work_mode,summary,status,questions)')
      .eq('token', token).maybeSingle();
    if (error) throw error;
    const expired = !data || !data.active || data.job?.status !== 'active'
      || new Date(data.expires_at).getTime() < Date.now() || data.use_count >= data.max_uses;
    if (expired) return res.status(404).json({ error: 'Este enlace ya no está disponible.' });
    return res.status(200).json({
      invite: { token: data.token, label: data.label, expiresAt: data.expires_at },
      job: data.job
    });
  } catch (error) {
    console.error('Invite lookup failed', { message: error?.message });
    return res.status(500).json({ error: 'No pudimos abrir la entrevista.' });
  }
};
