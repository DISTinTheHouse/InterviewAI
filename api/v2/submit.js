const Busboy = require('busboy');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');
const { getSupabaseAdmin } = require('../../lib/supabase-admin');
const { evaluateCandidate } = require('../../lib/evaluation');
const { notifySubmission } = require('../../lib/mailer');

const clean = (value, max = 3000) => String(value ?? '').trim().slice(0, max);
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let cv = null;
    let fileTooLarge = false;
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 30 } });
    busboy.on('field', (name, value) => { fields[name] = value; });
    busboy.on('file', (name, stream, info) => {
      if (name !== 'cv') { stream.resume(); return; }
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => { fileTooLarge = true; });
      stream.on('end', () => { cv = { buffer: Buffer.concat(chunks), filename: info.filename, mimeType: info.mimeType }; });
    });
    busboy.on('error', reject);
    busboy.on('finish', () => fileTooLarge ? reject(new Error('FILE_TOO_LARGE')) : resolve({ fields, cv }));
    req.pipe(busboy);
  });
}

async function rollbackCandidate(supabase, candidateId, cvPath) {
  await Promise.allSettled([
    supabase.from('interviewai_candidates').delete().eq('id', candidateId),
    cvPath ? supabase.storage.from('interviewai-cvs').remove([cvPath]) : Promise.resolve()
  ]);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) return res.status(415).json({ error: 'Formato no permitido.' });

  let parsed;
  try { parsed = await parseMultipart(req); }
  catch (error) {
    return res.status(error?.message === 'FILE_TOO_LARGE' ? 413 : 400).json({ error: 'El CV debe ser un PDF de máximo 5 MB.' });
  }
  const { fields, cv } = parsed;
  const token = clean(fields.token, 80);
  if (!isUuid(token)) return res.status(400).json({ error: 'Enlace de entrevista inválido.' });
  if (!cv || cv.mimeType !== 'application/pdf' || !cv.buffer.length) return res.status(400).json({ error: 'Adjunta tu CV en formato PDF.' });

  let answers;
  let skills;
  try { answers = JSON.parse(fields.answers); skills = JSON.parse(fields.skills || '[]'); }
  catch { return res.status(400).json({ error: 'La entrevista contiene datos inválidos.' }); }
  const candidate = {
    fullName: clean(fields.fullName, 120), email: clean(fields.email, 254).toLowerCase(),
    phone: clean(fields.phone, 40), location: clean(fields.location, 120),
    linkedinUrl: clean(fields.linkedinUrl, 300), experienceYears: Math.max(0, Math.min(60, Number(fields.experienceYears) || 0)),
    professionalSummary: clean(fields.professionalSummary, 1800),
    skills: Array.isArray(skills) ? skills.map((item) => clean(item, 80)).filter(Boolean).slice(0, 20) : []
  };
  if (!candidate.fullName || !validEmail(candidate.email) || candidate.professionalSummary.length < 40 || !fields.consent) {
    return res.status(400).json({ error: 'Completa tu perfil, correo y consentimiento.' });
  }

  const supabase = getSupabaseAdmin();
  const { data: invite, error: inviteError } = await supabase
    .from('interviewai_invites')
    .select('id,agency_id,job_id,expires_at,max_uses,use_count,active,job:interviewai_jobs(*)')
    .eq('token', token).maybeSingle();
  const unavailable = inviteError || !invite || !invite.active || invite.job?.status !== 'active'
    || new Date(invite.expires_at).getTime() < Date.now() || invite.use_count >= invite.max_uses;
  if (unavailable) return res.status(404).json({ error: 'Este enlace ya no está disponible.' });
  const questions = Array.isArray(invite.job.questions) ? invite.job.questions : [];
  if (!Array.isArray(answers) || answers.length !== questions.length || answers.some((item) => clean(item, 6000).length < 30)) {
    return res.status(400).json({ error: 'Responde todas las preguntas con suficiente detalle.' });
  }

  let cvText = '';
  try { cvText = clean((await pdfParse(cv.buffer)).text, 12000); }
  catch { cvText = ''; }
  const evaluation = evaluateCandidate({ answers, questions, cvText, profile: candidate });
  const candidateId = crypto.randomUUID();
  const cvPath = `${invite.agency_id}/${invite.job_id}/${candidateId}/${Date.now()}-cv.pdf`;

  try {
    const { error: uploadError } = await supabase.storage.from('interviewai-cvs').upload(cvPath, cv.buffer, {
      contentType: 'application/pdf', upsert: false, cacheControl: '3600'
    });
    if (uploadError) throw uploadError;
    const { error: candidateError } = await supabase.from('interviewai_candidates').insert({
      id: candidateId, agency_id: invite.agency_id, job_id: invite.job_id, invite_id: invite.id,
      full_name: candidate.fullName, email: candidate.email, phone: candidate.phone, location: candidate.location,
      linkedin_url: candidate.linkedinUrl, experience_years: candidate.experienceYears,
      professional_summary: candidate.professionalSummary, skills: candidate.skills, cv_path: cvPath,
      cv_text_excerpt: cvText.slice(0, 4000), consent_at: new Date().toISOString(), status: 'evaluated',
      ai_score: evaluation.score, ai_recommendation: evaluation.recommendation, ai_summary: evaluation.summary
    });
    if (candidateError) throw candidateError;
    const { error: answersError } = await supabase.from('interviewai_answers').insert(evaluation.details.map((item) => ({
      candidate_id: candidateId, question_order: item.questionOrder, competency: item.competency,
      question: item.question, answer: item.answer, score: item.score, evidence: item.evidence, gaps: item.gaps
    })));
    if (answersError) throw answersError;
    const { error: inviteUpdateError } = await supabase.from('interviewai_invites').update({ use_count: invite.use_count + 1 }).eq('id', invite.id).eq('use_count', invite.use_count);
    if (inviteUpdateError) throw inviteUpdateError;
  } catch (error) {
    await rollbackCandidate(supabase, candidateId, cvPath);
    console.error('Candidate submission failed', { message: error?.message });
    return res.status(500).json({ error: 'No pudimos guardar tu entrevista. Inténtalo de nuevo.' });
  }

  let emailSent = false;
  try { emailSent = (await notifySubmission({ candidate, job: invite.job, evaluation })).sent; }
  catch (error) { console.error('Submission email failed', { message: error?.message }); }
  return res.status(201).json({ ok: true, applicationId: candidateId, emailSent });
};
