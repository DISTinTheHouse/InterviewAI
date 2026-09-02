const ACTION_WORDS = /\b(implement(?:é|amos|aron)?|desarroll(?:é|amos|aron)?|diseñ(?:é|amos|aron)?|resolv(?:í|imos|ieron)?|coordin(?:é|amos|aron)?|propus(?:e|imos|ieron)?|automatic(?:é|amos|aron)?|negoci(?:é|amos|aron)?|analic(?:é|amos|aron)?|valid(?:é|amos|aron)?)\b/i;
const RESULT_WORDS = /\b(resultado|impacto|mejor(?:ó|amos|aron)?|reduj(?:e|imos|eron)?|aument(?:é|amos|aron)?|ahorr(?:é|amos|aron)?|entreg(?:ué|amos|aron)?|logr(?:é|amos|aron)?|evit(?:é|amos|aron)?)\b/i;
const CONTEXT_WORDS = /\b(situación|contexto|objetivo|problema|reto|responsable|equipo|cliente|proyecto)\b/i;
const METRIC = /(?:\b\d+(?:[.,]\d+)?\s?(?:%|horas?|días?|semanas?|meses?|usuarios?|clientes?|mxn|usd)\b|\$\s?\d+)/i;

const normalize = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function exactEvidence(answer) {
  const sentences = String(answer).split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const selected = sentences.find((item) => METRIC.test(item))
    || sentences.find((item) => ACTION_WORDS.test(item) || RESULT_WORDS.test(item))
    || sentences[0]
    || 'Sin evidencia textual suficiente.';
  return selected.slice(0, 280);
}

function scoreAnswer(answer, question, cvText, profileText) {
  const text = String(answer || '').trim();
  const combined = normalize(`${text} ${cvText || ''} ${profileText || ''}`);
  const signals = Array.isArray(question.signals) ? question.signals : [];
  const matchedSignals = signals.filter((signal) => combined.includes(normalize(signal)));
  const gaps = [];
  let score = 30;

  if (text.length >= 180) score += 12;
  else if (text.length >= 90) score += 7;
  else gaps.push('Falta profundidad en la respuesta');
  if (CONTEXT_WORDS.test(text)) score += 8;
  else gaps.push('No define claramente el contexto o reto');
  if (ACTION_WORDS.test(text)) score += 14;
  else gaps.push('No distingue con claridad las acciones propias');
  if (RESULT_WORDS.test(text)) score += 12;
  else gaps.push('No explica el resultado obtenido');
  if (METRIC.test(text)) score += 12;
  else gaps.push('Falta una métrica o evidencia cuantificable');
  score += Math.min(12, matchedSignals.length * 4);
  if (signals.length && !matchedSignals.length) gaps.push('Poca evidencia relacionada con la competencia técnica esperada');

  return {
    score: clamp(Math.round(score), 25, 96),
    evidence: exactEvidence(text),
    gaps: gaps.slice(0, 3),
    matchedSignals
  };
}

function evaluateCandidate({ answers, questions, cvText, profile }) {
  const safeQuestions = Array.isArray(questions) ? questions.slice(0, 10) : [];
  const profileText = `${profile.professionalSummary || ''} ${(profile.skills || []).join(' ')}`;
  const details = safeQuestions.map((question, index) => {
    const result = scoreAnswer(answers[index] || '', question, cvText, profileText);
    return {
      questionOrder: index + 1,
      competency: String(question.competency || `Competencia ${index + 1}`).slice(0, 100),
      question: String(question.question || '').slice(0, 1000),
      answer: String(answers[index] || '').trim().slice(0, 6000),
      weight: Number(question.weight) || Math.round(100 / Math.max(1, safeQuestions.length)),
      ...result
    };
  });

  const totalWeight = details.reduce((sum, item) => sum + item.weight, 0) || 1;
  const score = Math.round(details.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
  let recommendation = 'not_recommended';
  let label = 'No priorizar por ahora';
  if (score >= 82) { recommendation = 'strong_match'; label = 'Compatibilidad alta'; }
  else if (score >= 68) { recommendation = 'advance'; label = 'Recomendado para avanzar'; }
  else if (score >= 52) { recommendation = 'review'; label = 'Requiere revisión humana'; }

  const strongest = [...details].sort((a, b) => b.score - a.score).slice(0, 2).map((item) => item.competency);
  const weakest = [...details].sort((a, b) => a.score - b.score)[0];
  const summary = `${label}. Evidencia más sólida en ${strongest.join(' y ') || 'las respuestas compartidas'}. ${weakest ? `Conviene profundizar en ${weakest.competency}.` : ''}`;
  return { score, recommendation, label, summary, details };
}

module.exports = { evaluateCandidate };
