# InterviewAI

[![Live Demo](https://img.shields.io/badge/demo-live-2358e8)](https://interview-agent-done18.vercel.app)
[![Vercel](https://img.shields.io/badge/deployed%20on-Vercel-000000)](https://interview-agent-done18.vercel.app)
[![Node.js](https://img.shields.io/badge/Node.js-24.x-339933)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-b7f34a)](LICENSE)

Plataforma web de reclutamiento y preselección que automatiza la primera etapa de una entrevista laboral, desde la selección de una vacante hasta la entrega del reporte.

## Agency Console v2

La rama `v2/recruiter-console` amplía el proyecto para agencias de reclutamiento:

- acceso interno de reclutadores con Supabase Auth;
- vacantes con rúbricas y cinco preguntas comparables;
- enlaces únicos de entrevista;
- perfil, CV PDF y extracción de texto;
- evaluación automatizada con evidencia textual y brechas;
- ranking por compatibilidad y comparación de hasta tres candidatos;
- recomendación de IA con aprobación obligatoria de HR;
- historial de decisiones y almacenamiento privado de CVs.

Si el backend no está configurado, la consola incluye un modo demo con datos ficticios para conservar el recorrido completo. El modo demo no guarda información real.

## Demo

**[Abrir InterviewAI](https://interview-agent-done18.vercel.app)**

## Qué resuelve

InterviewAI permite que cada candidato:

1. Seleccione una vacante.
2. Complete su perfil profesional.
3. Responda cinco preguntas adaptadas al puesto.
4. Reciba una evaluación orientativa y feedback.
5. Envíe el reporte completo al reclutador y reciba una copia por correo.

## Vacantes incluidas

- Desarrollador Full Stack — Tecnología.
- Auxiliar Contable — Contabilidad.
- Coordinador Administrativo — Administración.

## Funcionalidades

- Landing page responsive y navegación móvil.
- Selección de vacante con autocompletado del formulario.
- Preguntas condicionales según el puesto y las respuestas.
- Evaluación orientativa con competencias observadas.
- Reporte completo de preguntas y respuestas.
- Envío doble de correo: reclutamiento y candidato.
- Validación de datos, sanitización HTML, rate limiting y control de duplicados.
- Contacto mediante WhatsApp.
- Despliegue serverless en Vercel.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | HTML5, CSS3 y JavaScript |
| Backend | Node.js y Vercel Functions |
| Correo | Nodemailer y Gmail SMTP |
| Datos y autenticación v2 | Supabase Postgres, Auth, Storage y RLS |
| Despliegue | Vercel |
| Flujo de construcción | ChatGPT Work Mode, Codex y Composio |

## Arquitectura

~~~mermaid
flowchart TD
    A[Candidato] --> B[Vacante y perfil]
    B --> C[Entrevista de 5 preguntas]
    C --> D[Evaluación orientativa]
    D --> E[Reporte completo]
    E --> F[Reclutador]
    E --> G[Copia al candidato]
~~~

## Ejecución local

Requisitos: Node.js 24 y una cuenta de Gmail con contraseña de aplicación.

~~~bash
npm install
cp .env.example .env.local
npx vercel dev
~~~

Configura estas variables en .env.local o en Vercel:

~~~env
GMAIL_USER=
GMAIL_APP_PASSWORD=
HR_REPORT_EMAIL=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=
~~~

Nunca publiques las credenciales reales. Los archivos .env están ignorados por Git, excepto .env.example.

Aplica `supabase/interviewai_v2.sql` una sola vez en tu proyecto Supabase. Todas las tablas usan el prefijo `interviewai_` para no interferir con otras aplicaciones del mismo proyecto.

## Despliegue

Importa este repositorio en Vercel, agrega las tres variables de entorno y publica el proyecto. La función api/send-report.js se ejecuta como función serverless.

## Uso responsable

La puntuación es orientativa y funciona como apoyo para la preselección. InterviewAI no toma decisiones de contratación: la evaluación final debe permanecer bajo supervisión humana.

## Autor

Desarrollado por [DISTinTheHouse](https://github.com/DISTinTheHouse).

## Licencia

Distribuido bajo la licencia [MIT](LICENSE).
