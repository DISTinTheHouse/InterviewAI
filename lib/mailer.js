const nodemailer = require('nodemailer');

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

async function notifySubmission({ candidate, job, evaluation }) {
  const user = String(process.env.GMAIL_USER || '').trim();
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  const recruiter = String(process.env.HR_REPORT_EMAIL || '').trim();
  if (!user || !pass || !recruiter) return { sent: false, reason: 'MAIL_NOT_CONFIGURED' };

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass }, connectionTimeout: 15000, socketTimeout: 30000
  });
  const consoleUrl = `${String(process.env.APP_URL || '').replace(/\/$/, '')}/console.html`;
  const body = `<!doctype html><html><body style="margin:0;background:#f3f5fa;font-family:Arial,sans-serif;color:#11172b">
    <table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="620" style="max-width:620px;width:100%;background:#fff;border-radius:18px;overflow:hidden" role="presentation">
    <tr><td style="background:#11172b;color:#fff;padding:24px 28px"><b style="font-size:22px">Interview<span style="color:#b8f34a">AI</span></b><div style="margin-top:10px;color:#b7bfd3">Nueva entrevista completada</div></td></tr>
    <tr><td style="padding:28px"><h1 style="margin:0 0 8px">${escapeHtml(candidate.fullName)}</h1><p style="margin:0 0 22px;color:#657087">${escapeHtml(job.title)}</p>
    <div style="background:#f3f5fa;border-radius:14px;padding:18px"><b style="font-size:34px">${evaluation.score}/100</b><span style="float:right;font-weight:700">${escapeHtml(evaluation.label)}</span></div>
    <p style="line-height:1.6;color:#49536a">${escapeHtml(evaluation.summary)}</p>
    ${consoleUrl ? `<a href="${escapeHtml(consoleUrl)}" style="display:inline-block;background:#2358e8;color:#fff;text-decoration:none;padding:13px 18px;border-radius:9px;font-weight:700">Revisar en la consola</a>` : ''}
    <p style="margin-top:24px;font-size:12px;color:#7a8397">La recomendación es orientativa. La decisión final corresponde a una persona de Reclutamiento.</p></td></tr></table></td></tr></table>
  </body></html>`;

  await transporter.sendMail({
    from: `InterviewAI <${user}>`, to: recruiter, cc: candidate.email,
    replyTo: candidate.email,
    subject: `InterviewAI · ${candidate.fullName} · ${job.title}`,
    html: body
  });
  return { sent: true };
}

module.exports = { notifySubmission };
