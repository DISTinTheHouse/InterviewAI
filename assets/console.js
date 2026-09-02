import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const formatDate = (value) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const shortName = (name) => String(name).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const labels = {
  active: 'Activa', paused: 'Pausada', closed: 'Cerrada', draft: 'Borrador',
  pending: 'Pendiente', advance: 'Avanzar', hold: 'En espera', reject: 'No avanzar',
  strong_match: 'Compatibilidad alta', review: 'Revisión humana', not_recommended: 'No priorizar'
};

const state = {
  mode: 'real', signup: false, supabase: null, user: null, agencyId: null,
  jobs: [], invites: [], candidates: [], answers: [], audit: [],
  selectedJobId: null, compare: new Set(), jobFilter: 'all', search: ''
};

function demoState() {
  const now = new Date();
  const jobs = [
    { id: 'job-tech', agency_id: 'demo', title: 'Desarrollador Full Stack', department: 'Tecnología', location: 'Guadalajara', work_mode: 'Híbrido', status: 'active', rubric: { technical: 35, problemSolving: 25, communication: 20, ownership: 20 }, questions: defaultQuestions('Desarrollador Full Stack', 'Tecnología'), created_at: now.toISOString() },
    { id: 'job-accounting', agency_id: 'demo', title: 'Auxiliar Contable', department: 'Contabilidad', location: 'Monterrey', work_mode: 'Presencial', status: 'active', rubric: { technical: 30, problemSolving: 30, communication: 15, ownership: 25 }, questions: defaultQuestions('Auxiliar Contable', 'Contabilidad'), created_at: now.toISOString() },
    { id: 'job-admin', agency_id: 'demo', title: 'Coordinador Administrativo', department: 'Administración', location: 'CDMX', work_mode: 'Híbrido', status: 'active', rubric: { technical: 25, problemSolving: 25, communication: 25, ownership: 25 }, questions: defaultQuestions('Coordinador Administrativo', 'Administración'), created_at: now.toISOString() }
  ];
  const people = [
    ['c1','Mariana Torres','mariana@example.com','job-tech',88,'strong_match','advance'],
    ['c2','Diego Hernández','diego@example.com','job-tech',79,'advance','pending'],
    ['c3','Ana Sofía López','ana@example.com','job-tech',67,'review','hold'],
    ['c4','Jorge Ramírez','jorge@example.com','job-accounting',84,'strong_match','pending'],
    ['c5','Valeria Cruz','valeria@example.com','job-admin',76,'advance','pending']
  ];
  const candidates = people.map(([id, full_name, email, job_id, ai_score, ai_recommendation, recruiter_decision], index) => ({
    id, agency_id: 'demo', job_id, full_name, email, ai_score, ai_recommendation, recruiter_decision,
    status: 'evaluated', professional_summary: 'Perfil ficticio para demostrar el flujo de revisión, comparación y decisión humana.',
    skills: job_id === 'job-tech' ? ['JavaScript','Node.js','SQL'] : ['Excel','Procesos','Comunicación'],
    experience_years: 3 + index, location: 'México', submitted_at: new Date(now - index * 86400000).toISOString(),
    ai_summary: `${labels[ai_recommendation]}. La evidencia muestra acciones concretas y resultados; conviene profundizar en métricas de impacto.`, cv_path: null
  }));
  const answers = candidates.flatMap((candidate) => jobs.find((job) => job.id === candidate.job_id).questions.map((question, index) => ({
    id: `${candidate.id}-a${index}`, candidate_id: candidate.id, question_order: index + 1,
    competency: question.competency, question: question.question,
    answer: `En un proyecto anterior asumí la responsabilidad de ${question.competency.toLowerCase()}. Organicé el trabajo, coordiné al equipo y entregamos el resultado dentro del plazo.`,
    score: Math.max(45, Math.min(96, candidate.ai_score + (index % 2 ? -5 : 4))),
    evidence: 'Organicé el trabajo, coordiné al equipo y entregamos el resultado dentro del plazo.',
    gaps: index % 2 ? ['Falta una métrica cuantificable'] : []
  })));
  const audit = [
    { id: 1, action: 'candidate.decision_changed', entity_type: 'candidate', metadata: { from: 'pending', to: 'advance' }, created_at: now.toISOString() },
    { id: 2, action: 'agency.created', entity_type: 'agency', metadata: { source: 'demo' }, created_at: new Date(now - 3600000).toISOString() }
  ];
  Object.assign(state, { mode: 'demo', agencyId: 'demo', jobs, candidates, answers, audit, invites: [], selectedJobId: 'job-tech' });
}

function defaultQuestions(title, department) {
  return [
    { competency: 'Experiencia relevante', weight: 25, question: `Cuéntanos sobre el proyecto o responsabilidad más relacionada con ${title}. ¿Qué hiciste y qué resultado tuvo?`, signals: [department, 'resultado', 'proyecto'] },
    { competency: 'Resolución de problemas', weight: 20, question: 'Describe un problema difícil: ¿cómo encontraste la causa y verificaste la solución?', signals: ['causa', 'prueba', 'solución'] },
    { competency: 'Criterio y priorización', weight: 20, question: '¿Cómo priorizas cuando existen varias solicitudes urgentes e información incompleta?', signals: ['impacto', 'urgencia', 'prioridad'] },
    { competency: 'Comunicación', weight: 15, question: 'Háblanos de una decisión que tuviste que explicar o negociar con otra persona.', signals: ['acuerdo', 'equipo', 'comunicación'] },
    { competency: 'Impacto y ownership', weight: 20, question: '¿Qué mejorarías durante tus primeros 90 días y cómo medirías el resultado?', signals: ['métrica', 'impacto', 'resultado'] }
  ];
}

async function initialize() {
  bindEvents();
  try {
    const configResponse = await fetch('/api/v2/config');
    if (!configResponse.ok) throw new Error('CONFIG');
    const config = await configResponse.json();
    state.supabase = createClient(config.supabaseUrl, config.publishableKey);
    const { data } = await state.supabase.auth.getSession();
    if (data.session) await enterRealApp(data.session.user);
  } catch {
    $('authMessage').textContent = 'El backend real no está disponible en este entorno. Puedes abrir la demo completa.';
  }
}

function bindEvents() {
  $('authForm').addEventListener('submit', handleAuth);
  $('toggleAuth').addEventListener('click', () => {
    state.signup = !state.signup;
    $('authSubmit').textContent = state.signup ? 'Crear cuenta de reclutador' : 'Iniciar sesión';
    $('toggleAuth').textContent = state.signup ? 'Ya tengo cuenta · Iniciar sesión' : '¿Primera vez? Crear cuenta';
    $('authMessage').textContent = '';
  });
  $('demoMode').addEventListener('click', () => { demoState(); openApp(); });
  $('logout').addEventListener('click', logout);
  $('menuToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.go)));
  [$('newJob'), $('newJobSecondary')].forEach((button) => button.addEventListener('click', () => openModal('jobModal')));
  $('jobForm').addEventListener('submit', createJob);
  $$('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)));
  $$('[data-job-filter]').forEach((button) => button.addEventListener('click', () => { state.jobFilter = button.dataset.jobFilter; $$('.filter').forEach((item) => item.classList.toggle('active', item === button)); renderVacancies(); }));
  $('jobSelector').addEventListener('change', () => { state.selectedJobId = $('jobSelector').value; state.compare.clear(); renderCandidates(); });
  $('candidateSearch').addEventListener('input', () => { state.search = $('candidateSearch').value.toLowerCase(); renderCandidateRows(); });
  $('openCompare').addEventListener('click', renderComparison);
  $('closeCompare').addEventListener('click', () => $('compareDrawer').classList.add('hidden'));
  $('copyInvite').addEventListener('click', async () => { await navigator.clipboard.writeText($('inviteUrl').value); toast('Enlace copiado'); });
  document.addEventListener('click', handleDelegatedClick);
}

async function handleAuth(event) {
  event.preventDefault();
  if (!state.supabase) return $('authMessage').textContent = 'Abre la demo mientras configuramos el backend.';
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  $('authSubmit').disabled = true;
  $('authMessage').textContent = 'Validando acceso…';
  try {
    const result = state.signup
      ? await state.supabase.auth.signUp({ email, password, options: { data: { product: 'InterviewAI' } } })
      : await state.supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (!result.data.session) {
      $('authMessage').textContent = 'Cuenta creada. Confirma el correo recibido y después inicia sesión.';
    } else await enterRealApp(result.data.user);
  } catch (error) {
    $('authMessage').textContent = authErrorMessage(error.message);
  } finally { $('authSubmit').disabled = false; }
}

function authErrorMessage(message = '') {
  if (/invalid login/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/already registered/i.test(message)) return 'Ese correo ya tiene cuenta. Inicia sesión.';
  if (/password/i.test(message)) return 'La contraseña debe tener al menos 8 caracteres.';
  return 'No pudimos completar el acceso. Inténtalo de nuevo.';
}

async function enterRealApp(user) {
  state.mode = 'real'; state.user = user;
  const { data: agencyId, error } = await state.supabase.rpc('interviewai_bootstrap_agency', { p_name: 'InterviewAI Agency' });
  if (error) throw error;
  state.agencyId = agencyId;
  await loadRealData();
  openApp();
}

async function loadRealData() {
  const agency = state.agencyId;
  const [agencyRes, jobsRes, invitesRes, candidatesRes, auditRes] = await Promise.all([
    state.supabase.from('interviewai_agencies').select('name').eq('id', agency).single(),
    state.supabase.from('interviewai_jobs').select('*').eq('agency_id', agency).order('created_at'),
    state.supabase.from('interviewai_invites').select('*').eq('agency_id', agency).order('created_at', { ascending: false }),
    state.supabase.from('interviewai_candidates').select('*').eq('agency_id', agency).order('ai_score', { ascending: false }),
    state.supabase.from('interviewai_audit_logs').select('*').eq('agency_id', agency).order('created_at', { ascending: false }).limit(100)
  ]);
  const failure = [agencyRes, jobsRes, invitesRes, candidatesRes, auditRes].find((item) => item.error);
  if (failure) throw failure.error;
  state.agencyName = agencyRes.data.name;
  state.jobs = jobsRes.data || []; state.invites = invitesRes.data || [];
  state.candidates = candidatesRes.data || []; state.audit = auditRes.data || [];
  const ids = state.candidates.map((item) => item.id);
  state.answers = ids.length ? (await state.supabase.from('interviewai_answers').select('*').in('candidate_id', ids).order('question_order')).data || [] : [];
  if (!state.selectedJobId || !state.jobs.some((job) => job.id === state.selectedJobId)) state.selectedJobId = state.jobs[0]?.id || null;
}

function openApp() {
  $('authView').classList.add('hidden'); $('appView').classList.remove('hidden');
  $('agencyName').textContent = state.agencyName || (state.mode === 'demo' ? 'Demo Agency' : 'InterviewAI Agency');
  $('workspaceMode').textContent = state.mode === 'demo' ? 'Modo demo · datos ficticios' : 'Backend seguro conectado';
  $('syncLabel').textContent = state.mode === 'demo' ? 'Demo local' : 'Datos sincronizados';
  renderAll();
}

async function logout() {
  if (state.mode === 'real' && state.supabase) await state.supabase.auth.signOut();
  location.reload();
}

function showView(view) {
  const titles = { dashboard: ['PANEL GENERAL','Buenos días, equipo.'], vacancies: ['PROCESOS','Vacantes y rúbricas'], candidates: ['TALENTO','Ranking de candidatos'], audit: ['TRAZABILIDAD','Actividad del equipo'] };
  $$('.view').forEach((item) => item.classList.add('hidden')); $(`${view}View`).classList.remove('hidden');
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('viewEyebrow').textContent = titles[view][0]; $('viewTitle').textContent = titles[view][1];
  $('sidebar').classList.remove('open');
}

function renderAll() {
  renderMetrics(); renderDashboardJobs(); renderTopCandidates(); renderPipeline(); renderVacancies(); renderJobSelector(); renderCandidates(); renderAudit();
}

function candidatesFor(jobId) { return state.candidates.filter((item) => !jobId || item.job_id === jobId); }
function jobFor(id) { return state.jobs.find((item) => item.id === id); }
function answersFor(id) { return state.answers.filter((item) => item.candidate_id === id).sort((a, b) => a.question_order - b.question_order); }
function strengthFor(candidate) { return [...answersFor(candidate.id)].sort((a, b) => b.score - a.score)[0]?.competency || 'Perfil por revisar'; }

function renderMetrics() {
  const active = state.candidates.filter((item) => !['rejected','hired'].includes(item.status));
  const avg = active.length ? Math.round(active.reduce((sum, item) => sum + Number(item.ai_score), 0) / active.length) : 0;
  $('metricCandidates').textContent = active.length; $('metricScore').textContent = avg;
  $('metricPending').textContent = active.filter((item) => item.recruiter_decision === 'pending').length;
  $('metricHours').textContent = `${Math.round(active.length * .65)}h`;
}

function jobCard(job) {
  const candidates = candidatesFor(job.id); const avg = candidates.length ? Math.round(candidates.reduce((sum, item) => sum + Number(item.ai_score), 0) / candidates.length) : 0;
  return `<article class="job-card"><div class="job-card-top"><span class="job-icon">${escapeHtml(job.department.slice(0,2).toUpperCase())}</span><span class="status-pill ${job.status}">${labels[job.status] || job.status}</span></div><div><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.department)} · ${escapeHtml(job.location)} · ${escapeHtml(job.work_mode)}</p></div><div class="job-stats"><span><b>${candidates.length}</b>Candidatos</span><span><b>${avg || '—'}</b>Score medio</span><span><b>${job.questions?.length || 5}</b>Preguntas</span></div><div class="job-actions"><button class="button secondary small" data-job-candidates="${job.id}">Ver ranking</button><button class="button primary small" data-invite-job="${job.id}">Crear enlace</button></div></article>`;
}

function renderDashboardJobs() { $('dashboardJobs').innerHTML = state.jobs.filter((job) => job.status === 'active').slice(0,3).map(jobCard).join('') || '<p>No hay vacantes activas.</p>'; }
function renderTopCandidates() {
  $('topCandidates').innerHTML = [...state.candidates].sort((a,b) => b.ai_score-a.ai_score).slice(0,5).map((candidate) => `<div class="candidate-mini"><span class="avatar">${shortName(candidate.full_name)}</span><div><strong>${escapeHtml(candidate.full_name)}</strong><span>${escapeHtml(jobFor(candidate.job_id)?.title || '')} · ${escapeHtml(strengthFor(candidate))}</span></div><b>${Math.round(candidate.ai_score)}</b></div>`).join('') || '<p class="microcopy">Comparte un enlace para recibir candidatos.</p>';
}

function renderPipeline() {
  const groups = [['Evaluados','evaluated'],['Shortlist','shortlist'],['Entrevista','interview'],['Oferta','offer'],['Contratados','hired']];
  const max = Math.max(1, ...groups.map(([,status]) => state.candidates.filter((item) => item.status === status).length));
  $('pipelineBars').innerHTML = groups.map(([label,status]) => { const count=state.candidates.filter((item)=>item.status===status).length; return `<div class="pipeline-row"><span>${label}</span><div class="bar-track"><i style="width:${Math.max(count ? 10 : 0, count/max*100)}%"></i></div><b>${count}</b></div>`; }).join('');
}

function renderVacancies() {
  const jobs = state.jobs.filter((job) => state.jobFilter === 'all' || job.status === state.jobFilter);
  $('vacancyList').innerHTML = jobs.map((job) => {
    const candidates=candidatesFor(job.id); const rubric=Object.entries(job.rubric||{}).map(([name,value])=>`<span>${escapeHtml(name)} ${value}%</span>`).join('');
    return `<article class="vacancy-row"><span class="job-icon">${escapeHtml(job.department.slice(0,2).toUpperCase())}</span><div><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.department)} · ${escapeHtml(job.location)} · ${escapeHtml(job.work_mode)}</p></div><div class="rubric-chips">${rubric}</div><div class="vacancy-metric"><small>RECIBIDOS</small><b>${candidates.length} perfiles</b></div><div class="row-actions"><button class="button secondary small" data-job-candidates="${job.id}">Ranking</button><button class="button primary small" data-invite-job="${job.id}">Enlace</button></div><span class="status-pill ${job.status}">${labels[job.status]||job.status}</span></article>`;
  }).join('') || '<div class="empty-state"><h3>No hay vacantes en este estado</h3></div>';
}

function renderJobSelector() {
  $('jobSelector').innerHTML = state.jobs.map((job) => `<option value="${job.id}" ${job.id===state.selectedJobId?'selected':''}>${escapeHtml(job.title)} · ${candidatesFor(job.id).length} candidatos</option>`).join('');
}

function renderCandidates() {
  const list=candidatesFor(state.selectedJobId); const avg=list.length?Math.round(list.reduce((s,c)=>s+Number(c.ai_score),0)/list.length):0;
  $('rankingSummary').innerHTML = `<div class="ranking-chip"><small>CANDIDATOS</small><b>${list.length}</b></div><div class="ranking-chip"><small>COMPATIBILIDAD MEDIA</small><b>${avg}/100</b></div><div class="ranking-chip"><small>RECOMENDADOS PARA AVANZAR</small><b>${list.filter((c)=>['strong_match','advance'].includes(c.ai_recommendation)).length}</b></div>`;
  renderCandidateRows();
}

function renderCandidateRows() {
  let list=candidatesFor(state.selectedJobId).filter((candidate)=>`${candidate.full_name} ${candidate.email}`.toLowerCase().includes(state.search));
  list=[...list].sort((a,b)=>b.ai_score-a.ai_score);
  $('candidateRows').innerHTML=list.map((candidate,index)=>`<tr><td><input class="checkbox compare-check" type="checkbox" data-compare="${candidate.id}" ${state.compare.has(candidate.id)?'checked':''}></td><td><span class="rank-number">#${index+1}</span></td><td><strong>${escapeHtml(candidate.full_name)}</strong><small>${escapeHtml(candidate.email)}</small></td><td class="score-cell"><div class="score-line"><b>${Math.round(candidate.ai_score)}</b><div class="bar-track"><i style="width:${candidate.ai_score}%"></i></div></div></td><td>${escapeHtml(strengthFor(candidate))}</td><td><span class="recommend-pill ${candidate.ai_recommendation}">${labels[candidate.ai_recommendation]||candidate.ai_recommendation}</span></td><td><span class="decision-pill ${candidate.recruiter_decision}">${labels[candidate.recruiter_decision]||candidate.recruiter_decision}</span></td><td><button class="text-button" data-open-candidate="${candidate.id}">Revisar →</button></td></tr>`).join('');
  $('candidateEmpty').classList.toggle('hidden',list.length>0); $('compareCount').textContent=state.compare.size; $('openCompare').disabled=state.compare.size<2;
}

function renderAudit() {
  const descriptions={ 'agency.created':'Espacio de trabajo creado', 'candidate.decision_changed':'Decisión de HR actualizada', 'job.created':'Vacante creada', 'invite.created':'Enlace de entrevista creado' };
  $('activityList').innerHTML=state.audit.map((item)=>`<article class="activity-item"><span class="activity-icon">↺</span><div><strong>${descriptions[item.action]||escapeHtml(item.action)}</strong><p>${item.metadata?.from ? `${labels[item.metadata.from]||item.metadata.from} → ${labels[item.metadata.to]||item.metadata.to}` : escapeHtml(item.entity_type)}</p></div><time>${formatDate(item.created_at)}</time></article>`).join('')||'<p class="microcopy">La actividad relevante aparecerá aquí.</p>';
}

async function createJob(event) {
  event.preventDefault(); const form=new FormData(event.currentTarget);
  const rubric={technical:Number(form.get('technical')),problemSolving:Number(form.get('problemSolving')),communication:Number(form.get('communication')),ownership:Number(form.get('ownership'))};
  if(Object.values(rubric).reduce((a,b)=>a+b,0)!==100)return $('jobMessage').textContent='Los pesos deben sumar exactamente 100%.';
  const job={id:crypto.randomUUID(),agency_id:state.agencyId,title:String(form.get('title')).trim(),department:String(form.get('department')).trim(),location:String(form.get('location')).trim(),work_mode:form.get('workMode'),summary:String(form.get('summary')).trim(),status:'active',rubric,questions:defaultQuestions(form.get('title'),form.get('department')),created_at:new Date().toISOString()};
  try{
    if(state.mode==='real'){
      const {data,error}=await state.supabase.from('interviewai_jobs').insert({...job,id:undefined,created_by:state.user.id}).select().single(); if(error)throw error; Object.assign(job,data);
      await state.supabase.from('interviewai_audit_logs').insert({agency_id:state.agencyId,actor_user_id:state.user.id,action:'job.created',entity_type:'job',entity_id:job.id,metadata:{title:job.title}});
    }
    state.jobs.push(job);state.selectedJobId=job.id;event.currentTarget.reset();closeModal('jobModal');renderAll();toast('Vacante creada con rúbrica base');
  }catch(error){$('jobMessage').textContent='No pudimos crear la vacante.';console.error(error);}
}

async function createInvite(jobId) {
  const job=jobFor(jobId); if(!job)return;
  let token=crypto.randomUUID();
  try{
    if(state.mode==='real'){
      const {data,error}=await state.supabase.from('interviewai_invites').insert({agency_id:state.agencyId,job_id:job.id,label:'Enlace general',created_by:state.user.id}).select().single();if(error)throw error;token=data.token;state.invites.unshift(data);
    }
    $('inviteJobName').textContent=`${job.title} · ${job.location}`;$('inviteUrl').value=`${location.origin}/apply.html?token=${state.mode==='demo'?'demo':token}`;openModal('inviteModal');
  }catch(error){toast('No pudimos crear el enlace');console.error(error);}
}

function openCandidate(id) {
  const candidate=state.candidates.find((item)=>item.id===id);if(!candidate)return;const answers=answersFor(id);
  $('candidateDossier').innerHTML=`<div class="dossier-head"><div><span class="eyebrow">DOSSIER DEL CANDIDATO</span><h2 id="candidateModalName">${escapeHtml(candidate.full_name)}</h2><p>${escapeHtml(jobFor(candidate.job_id)?.title||'')} · ${escapeHtml(candidate.location||'México')} · ${candidate.experience_years||0} años</p></div><div class="big-score"><b>${Math.round(candidate.ai_score)}</b><span>COMPATIBILIDAD / 100</span></div></div><div class="dossier-summary"><article class="summary-card"><small>RECOMENDACIÓN AUTOMATIZADA</small><p><span class="recommend-pill ${candidate.ai_recommendation}">${labels[candidate.ai_recommendation]||candidate.ai_recommendation}</span></p><p>${escapeHtml(candidate.ai_summary)}</p></article><article class="summary-card"><small>PERFIL Y HABILIDADES</small><p>${escapeHtml(candidate.professional_summary)}</p><p>${(candidate.skills||[]).map((skill)=>`<span class="rubric-chips"><span>${escapeHtml(skill)}</span></span>`).join(' ')}</p>${candidate.cv_path?`<button class="text-button" data-open-cv="${candidate.id}">Abrir CV PDF →</button>`:''}</article></div><span class="eyebrow">EVIDENCIA POR COMPETENCIA</span><div class="evidence-list">${answers.map((answer)=>`<article class="evidence-card"><div class="evidence-top"><h4>${escapeHtml(answer.competency)}</h4><b>${Math.round(answer.score)}/100</b></div><p>${escapeHtml(answer.question)}</p><p class="quote">“${escapeHtml(answer.evidence)}”</p><div class="gap-list">${(answer.gaps||[]).map((gap)=>`<span>${escapeHtml(gap)}</span>`).join('')}</div></article>`).join('')}</div><div class="decision-bar"><div><span class="eyebrow">DECISIÓN FINAL DE HR</span><strong>${labels[candidate.recruiter_decision]||candidate.recruiter_decision}</strong></div><div class="decision-buttons"><button class="button secondary small" data-decision="hold" data-candidate="${candidate.id}">En espera</button><button class="button secondary small" data-decision="reject" data-candidate="${candidate.id}">No avanzar</button><button class="button primary small" data-decision="advance" data-candidate="${candidate.id}">Avanzar</button></div></div>`;
  openModal('candidateModal');
}

async function updateDecision(candidateId,decision){
  const candidate=state.candidates.find((item)=>item.id===candidateId);if(!candidate)return;const previous=candidate.recruiter_decision;
  try{if(state.mode==='real'){const {error}=await state.supabase.from('interviewai_candidates').update({recruiter_decision:decision,reviewed_by:state.user.id,reviewed_at:new Date().toISOString(),status:decision==='advance'?'shortlist':decision==='reject'?'rejected':candidate.status}).eq('id',candidateId);if(error)throw error;}
    candidate.recruiter_decision=decision;if(decision==='advance')candidate.status='shortlist';if(decision==='reject')candidate.status='rejected';state.audit.unshift({id:Date.now(),action:'candidate.decision_changed',entity_type:'candidate',metadata:{from:previous,to:decision},created_at:new Date().toISOString()});renderAll();openCandidate(candidateId);toast('Decisión de HR guardada');
  }catch(error){toast('No pudimos guardar la decisión');console.error(error);}
}

async function openCv(candidateId){const candidate=state.candidates.find((item)=>item.id===candidateId);if(!candidate?.cv_path)return;if(state.mode==='demo')return toast('El CV no está disponible en la demo');const {data,error}=await state.supabase.storage.from('interviewai-cvs').createSignedUrl(candidate.cv_path,300);if(error)return toast('No pudimos abrir el CV');window.open(data.signedUrl,'_blank','noopener');}

function toggleCompare(id,checked){if(checked&&state.compare.size>=3){toast('Puedes comparar hasta 3 candidatos');renderCandidateRows();return;}checked?state.compare.add(id):state.compare.delete(id);renderCandidateRows();}
function renderComparison(){const candidates=[...state.compare].map((id)=>state.candidates.find((item)=>item.id===id)).filter(Boolean);$('compareGrid').innerHTML=candidates.map((candidate)=>`<article class="compare-column"><div class="compare-person"><span class="eyebrow lime">${labels[candidate.ai_recommendation]||candidate.ai_recommendation}</span><h3>${escapeHtml(candidate.full_name)}</h3><b>${Math.round(candidate.ai_score)}/100</b></div>${answersFor(candidate.id).map((answer)=>`<div class="compare-competency"><h4>${escapeHtml(answer.competency)} · ${Math.round(answer.score)}</h4><p>“${escapeHtml(answer.evidence)}”</p>${answer.gaps?.length?`<p><b>Profundizar:</b> ${escapeHtml(answer.gaps.join(', '))}</p>`:''}</div>`).join('')}</article>`).join('');$('compareDrawer').classList.remove('hidden');}

function handleDelegatedClick(event){const target=event.target.closest('button,input');if(!target)return;if(target.dataset.jobCandidates){state.selectedJobId=target.dataset.jobCandidates;renderJobSelector();renderCandidates();showView('candidates');}if(target.dataset.inviteJob)createInvite(target.dataset.inviteJob);if(target.dataset.openCandidate)openCandidate(target.dataset.openCandidate);if(target.dataset.decision)updateDecision(target.dataset.candidate,target.dataset.decision);if(target.dataset.openCv)openCv(target.dataset.openCv);if(target.dataset.compare)toggleCompare(target.dataset.compare,target.checked);}
function openModal(id){$(id).classList.remove('hidden');document.body.style.overflow='hidden'}function closeModal(id){$(id).classList.add('hidden');document.body.style.overflow=''}
let toastTimer;function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600)}

initialize();
