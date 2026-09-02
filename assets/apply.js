const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { token: new URLSearchParams(location.search).get('token'), job: null, step: 1, demo: false };

const demoJob = {
  id: 'demo', agency_id: 'demo', title: 'Desarrollador Full Stack', department: 'Tecnología', location: 'Guadalajara', work_mode: 'Híbrido',
  summary: 'Construcción y mantenimiento de productos web con JavaScript, APIs, bases de datos y prácticas de entrega continua.',
  questions: [
    { competency: 'Experiencia técnica', weight: 25, question: 'Cuéntanos sobre el producto web más completo que hayas construido. ¿Qué parte desarrollaste y qué resultado tuvo?' },
    { competency: 'Resolución de problemas', weight: 20, question: 'Describe un error complejo de producción: ¿cómo encontraste la causa y cómo verificaste la solución?' },
    { competency: 'Arquitectura', weight: 20, question: '¿Cómo diseñarías una función que recibe datos, los valida, los guarda y notifica al usuario?' },
    { competency: 'Colaboración', weight: 15, question: 'Háblanos de una decisión técnica que tuviste que explicar o negociar con otra persona.' },
    { competency: 'Impacto y ownership', weight: 20, question: '¿Qué mejorarías durante tus primeros 90 días y cómo medirías el impacto?' }
  ]
};

async function initialize() {
  if (!state.token) return showError('El enlace no contiene un identificador de entrevista.');
  if (state.token === 'demo') { state.job = demoJob; state.demo = true; return showApplication(); }
  try {
    const response = await fetch(`/api/v2/invite?token=${encodeURIComponent(state.token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    state.job = data.job; showApplication();
  } catch (error) { showError(error.message || 'Solicita un enlace nuevo al equipo de Reclutamiento.'); }
}

function showApplication() {
  $('loadingView').classList.add('hidden'); $('applicationView').classList.remove('hidden');
  $('jobTitle').textContent = state.job.title; $('jobSummary').textContent = state.job.summary;
  $('jobDepartment').textContent = state.job.department; $('jobLocation').textContent = state.job.location; $('jobMode').textContent = state.job.work_mode;
  $('reviewJob').textContent = state.job.title;
  $('questionList').innerHTML = state.job.questions.map((question, index) => `<article class="question-card"><div class="question-top"><span>${escapeHtml(question.competency)}</span><small>${question.weight || 20}% de la evaluación</small></div><h3>${index + 1}. ${escapeHtml(question.question)}</h3><textarea name="answer-${index}" required minlength="30" maxlength="6000" placeholder="Describe la situación, tus acciones y el resultado…"></textarea><span class="answer-count" data-count="${index}">0 caracteres</span></article>`).join('');
  bindEvents();
}

function bindEvents() {
  $$('[data-next]').forEach((button) => button.addEventListener('click', () => navigate(Number(button.dataset.next))));
  $$('[data-prev]').forEach((button) => button.addEventListener('click', () => navigate(Number(button.dataset.prev))));
  $('cvInput').addEventListener('change', validateCv);
  $('applicationForm').addEventListener('submit', submitApplication);
  state.job.questions.forEach((_, index) => { const area=document.querySelector(`[name="answer-${index}"]`); area.addEventListener('input',()=>document.querySelector(`[data-count="${index}"]`).textContent=`${area.value.length} caracteres`); });
}

function navigate(nextStep) {
  if (nextStep > state.step && !validateStep(state.step)) return;
  state.step = nextStep; $$('.form-step').forEach((step) => step.classList.toggle('hidden', Number(step.dataset.step) !== nextStep));
  $$('.progress-list button').forEach((item) => item.classList.toggle('active', Number(item.dataset.stepNav) === nextStep));
  $('mobileStep').textContent = `Paso ${nextStep} de 3`; $('mobileBar').style.width = `${nextStep / 3 * 100}%`;
  if (nextStep === 3) updateReview();
  scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(step) {
  const section = document.querySelector(`[data-step="${step}"]`); const fields = [...section.querySelectorAll('input,textarea')];
  for (const field of fields) { if (!field.checkValidity()) { field.reportValidity(); field.focus(); return false; } }
  if (step === 1 && !validateCv()) return false;
  return true;
}

function validateCv() {
  const file = $('cvInput').files[0];
  if (!file) return false;
  if (file.type !== 'application/pdf' || file.size > 5 * 1024 * 1024) { $('cvInput').value=''; $('fileLabel').textContent='Elige un PDF válido'; $('fileMeta').textContent='Máximo 5 MB'; $('fileDrop').classList.remove('ready'); return false; }
  $('fileLabel').textContent=file.name; $('fileMeta').textContent=`${(file.size/1024/1024).toFixed(2)} MB · PDF listo`; $('fileDrop').classList.add('ready'); return true;
}

function updateReview() {
  const form=new FormData($('applicationForm')); $('reviewName').textContent=form.get('fullName'); $('reviewCv').textContent=$('cvInput').files[0]?.name||'Pendiente';
  const complete=state.job.questions.filter((_,index)=>String(form.get(`answer-${index}`)||'').trim().length>=30).length; $('reviewAnswers').textContent=`${complete} de ${state.job.questions.length}`;
}

async function submitApplication(event) {
  event.preventDefault(); if(!validateStep(3))return; const button=$('submitApplication');button.disabled=true;button.textContent='Enviando de forma segura…';$('submitMessage').textContent='';
  const source=new FormData(event.currentTarget); const payload=new FormData();
  ['fullName','email','phone','location','linkedinUrl','experienceYears','professionalSummary'].forEach((name)=>payload.append(name,source.get(name)||''));
  payload.append('skills',JSON.stringify(String(source.get('skills')||'').split(',').map((item)=>item.trim()).filter(Boolean)));
  payload.append('answers',JSON.stringify(state.job.questions.map((_,index)=>String(source.get(`answer-${index}`)||'').trim())));
  payload.append('cv',$('cvInput').files[0]);payload.append('consent','true');payload.append('token',state.token);
  try {
    let data;
    if(state.demo){await new Promise((resolve)=>setTimeout(resolve,900));data={ok:true,applicationId:`DEMO-${crypto.randomUUID().slice(0,8).toUpperCase()}`};}
    else{const response=await fetch('/api/v2/submit',{method:'POST',body:payload});data=await response.json();if(!response.ok)throw new Error(data.error);}
    $('applicationView').classList.add('hidden');$('successView').classList.remove('hidden');$('applicationId').textContent=data.applicationId;scrollTo(0,0);
  } catch(error){$('submitMessage').textContent=error.message||'No pudimos enviar tu entrevista. Inténtalo de nuevo.';button.disabled=false;button.textContent='Enviar postulación';}
}

function showError(message) { $('loadingView').classList.add('hidden'); $('errorView').classList.remove('hidden'); $('errorMessage').textContent=message; }
initialize();
