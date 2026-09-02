module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  const url = String(process.env.SUPABASE_URL || '').trim();
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url || !publishableKey) return res.status(503).json({ error: 'Backend no configurado.' });
  return res.status(200).json({ supabaseUrl: url, publishableKey });
};
