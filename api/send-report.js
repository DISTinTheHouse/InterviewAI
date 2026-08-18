const nodemailer = require("nodemailer");

const rateStore = globalThis.__interviewEmailRateStore || (globalThis.__interviewEmailRateStore = new Map());
const sentStore = globalThis.__interviewSentStore || (globalThis.__interviewSentStore = new Map());

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const clean = (value, max = 5000) => String(value ?? "").trim().slice(0, max);
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

function allowRequest(ip) {
  const now = Date.now();
  const recent = (rateStore.get(ip) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 3) return false;
  recent.push(now);
  rateStore.set(ip, recent);
  return true;
}

function reportHtml(report) {
  const profile = report.profile;
  const rows = report.answers.map((item, index) => `
    <tr><td style="padding:18px 0;border-bottom:1px solid #e4e8ef">
      <div style="font-size:12px;font-weight:700;color:#2358e8">PREGUNTA ${index + 1} · ${escapeHtml(item.comp)}</div>
      <h3 style="margin:6px 0 8px;font-size:16px;color:#10162b">${escapeHtml(item.q)}</h3>
      <p style="margin:0;color:#49536a;line-height:1.55">${escapeHtml(item.a)}</p>
      <div style="margin-top:8px;font-weight:700;color:#10162b">Puntuación orientativa: ${item.score}/100</div>
    </td></tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#10162b">
    <div style="display:none;max-height:0;overflow:hidden">Reporte InterviewAI de ${escapeHtml(profile.name)}</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:30px 14px">
      <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:640px;background:#fff;border-radius:18px;overflow:hidden">
        <tr><td style="background:#10162b;color:#fff;padding:25px 30px"><div style="font-size:22px;font-weight:800">Interview<span style="color:#b7f34a">AI</span></div><div style="margin-top:14px;color:#b7c1d8;font-size:12px">REPORTE DE ENTREVISTA · ${escapeHtml(report.sessionId)}</div></td></tr>
        <tr><td style="padding:28px 30px">
          <p style="margin:0 0 6px;color:#687187">Reporte de preselección generado por InterviewAI para revisión de Reclutamiento.</p>
          <h1 style="margin:0;font-size:28px">${escapeHtml(profile.name)}</h1>
          <p style="margin:7px 0 24px;color:#49536a">${escapeHtml(profile.role)} · ${escapeHtml(profile.level)} · ${escapeHtml(profile.experience)}</p>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f7fb;border-radius:14px"><tr>
            <td style="padding:18px"><div style="font-size:12px;color:#687187">EVALUACIÓN GENERAL</div><div style="font-size:36px;font-weight:800">${report.score}<span style="font-size:16px">/100</span></div></td>
            <td style="padding:18px;text-align:right;font-weight:700">${escapeHtml(report.verdict)}</td>
          </tr></table>
          <h2 style="margin:26px 0 8px;font-size:18px">Feedback del agente</h2>
          <p style="margin:0;color:#49536a;line-height:1.6">${escapeHtml(report.feedback)}</p>
          <h2 style="margin:28px 0 0;font-size:18px">Resumen completo de respuestas</h2>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>
          <p style="margin:24px 0 0;color:#7b8497;font-size:12px;line-height:1.5">Evaluación orientativa basada en la evidencia expresada durante la entrevista. Debe revisarse con criterio humano y no sustituye una decisión profesional de selección.</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const origin = clean(req.headers.origin, 300);
  const host = clean(req.headers.host, 300);
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return res.status(403).json({ error: "Origen no permitido." });
    } catch {
      return res.status(403).json({ error: "Origen no permitido." });
    }
  }

  const ip = clean(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown", 100).split(",")[0];
  if (!allowRequest(ip)) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Solicitud inválida." }); }
  }
  if (!body || typeof body !== "object" || body.company) return res.status(400).json({ error: "Solicitud inválida." });

  const recipientEmail = clean(body.candidateEmail, 254);
  if (!recipientEmail || !validEmail(recipientEmail)) return res.status(400).json({ error: "Escribe un correo válido para enviar el reporte." });

  const sourceProfile = body.profile || {};
  const profile = {
    name: clean(sourceProfile.name, 120),
    role: clean(sourceProfile.role, 160),
    level: clean(sourceProfile.level, 80),
    experience: clean(sourceProfile.experience, 80),
    skills: clean(sourceProfile.skills, 600),
    summary: clean(sourceProfile.summary, 1800)
  };
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 10).map((item) => ({
    q: clean(item.q, 1000), a: clean(item.a, 6000), comp: clean(item.comp, 160),
    score: Math.max(0, Math.min(100, Number(item.score) || 0))
  })) : [];
  const report = {
    sessionId: clean(body.sessionId, 80),
    profile,
    score: Math.max(0, Math.min(100, Number(body.score) || 0)),
    verdict: clean(body.verdict, 180),
    feedback: clean(body.feedback, 1800),
    answers
  };
  if (!profile.name || !profile.role || !report.sessionId || answers.length === 0) return res.status(400).json({ error: "El reporte está incompleto." });

  const gmailUser = clean(process.env.GMAIL_USER, 254);
  const appPassword = clean(process.env.GMAIL_APP_PASSWORD, 100).replace(/\s/g, "");
  const recruiterEmail = clean(process.env.HR_REPORT_EMAIL, 254);
  if (!validEmail(gmailUser) || !appPassword || !validEmail(recruiterEmail)) return res.status(503).json({ error: "El servicio de correo aún no está configurado." });

  const dedupeKey = `${report.sessionId}:${recruiterEmail.toLowerCase()}:${recipientEmail.toLowerCase()}`;
  const previous = sentStore.get(dedupeKey);
  if (previous && Date.now() - previous < 60 * 60 * 1000) {
    return res.status(200).json({ ok: true, duplicate: true, message: "✓ Este reporte ya fue enviado a ese correo." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: appPassword },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000
    });
    const candidateIsRecruiter = recipientEmail.toLowerCase() === recruiterEmail.toLowerCase();
    await transporter.sendMail({
      from: `InterviewAI <${gmailUser}>`,
      to: recruiterEmail,
      cc: candidateIsRecruiter ? undefined : recipientEmail,
      replyTo: recipientEmail,
      subject: `InterviewAI · ${profile.name} · ${profile.role}`,
      html: reportHtml(report)
    });
    sentStore.set(dedupeKey, Date.now());
    const message = candidateIsRecruiter
      ? "✓ Reporte enviado correctamente a Reclutamiento."
      : `✓ Reporte enviado a Reclutamiento y copia a ${recipientEmail}.`;
    return res.status(200).json({ ok: true, message });
  } catch (error) {
    console.error("InterviewAI email delivery failed", {
      code: clean(error && error.code, 80),
      command: clean(error && error.command, 80),
      responseCode: Number(error && error.responseCode) || undefined
    });
    return res.status(502).json({ error: "No pudimos enviar el reporte. Verifica el correo e inténtalo de nuevo." });
  }
};
