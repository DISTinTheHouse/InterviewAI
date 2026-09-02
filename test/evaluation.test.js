const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCandidate } = require('../lib/evaluation');

const questions = [{
  competency: 'Resolución de problemas', weight: 100,
  question: 'Describe un incidente y su resultado.', signals: ['logs', 'pruebas', 'monitoreo']
}];

test('premia evidencia STAR, acciones y métricas sin superar 100', () => {
  const answer = 'En un proyecto con 2,000 usuarios detecté un error revisando logs. Implementé pruebas y monitoreo, resolví la causa y logramos reducir los incidentes 35% durante tres meses.';
  const result = evaluateCandidate({
    answers: [answer], questions, cvText: 'Experiencia con logs y monitoreo',
    profile: { professionalSummary: 'Desarrollador backend', skills: ['Pruebas'] }
  });
  assert.ok(result.score >= 80 && result.score <= 100);
  assert.match(result.details[0].evidence, /2,000|35%/);
  assert.equal(result.details[0].answer, answer);
});

test('marca brechas cuando la respuesta es genérica', () => {
  const result = evaluateCandidate({
    answers: ['Ayudé al equipo con un problema y todo salió bien.'], questions,
    cvText: '', profile: { professionalSummary: '', skills: [] }
  });
  assert.ok(result.score < 68);
  assert.ok(result.details[0].gaps.length >= 2);
  assert.equal(result.recommendation, 'not_recommended');
});
