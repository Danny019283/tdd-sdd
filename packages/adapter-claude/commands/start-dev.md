---
description: Inicia o retoma el desarrollo guiado por casos de uso (SDD + TDD)
---

Inicia o retoma el flujo del harness `tdd-sdd`. Sigue estos pasos en orden y **no avances si falta claridad: pregunta al humano** (usa AskUserQuestion o preguntas directas, una a la vez).

1. Ejecuta `tdd-sdd status` (el comando CLI exacto lo indicó el hook de inicio de sesión).
   - Si hay un caso de uso **activo/incompleto**: muestra el estado y retoma en la fase actual (ver skill `tdd-cycle`). No crees otro caso de uso.
2. Si el proyecto aún no tiene la arquitectura documentada (no hay sección `## Arquitectura` en `CLAUDE.md`):
   entrevista al humano sobre lenguaje, framework, capas/estructura, convención de tests y **comando de tests**.
   Escribe las respuestas en `CLAUDE.md` y `AGENTS.md` (sección `## Arquitectura`) y el comando en `.tdd-sdd/config.json` como `{ "testCommand": "..." }`.
3. Si no hay caso de uso activo: pregunta el nombre del caso de uso (verbo + objeto), conviértelo a kebab-case y ejecuta `tdd-sdd init <id>`.
   Esto crea `.tdd-sdd/use-cases/<id>/spec.md` con la plantilla de caso de uso.
4. Rellena la spec **entrevistando al humano sección por sección** siguiendo el skill `spec-interview`.
5. Cuando la spec esté completa, dile al humano que revise y ejecute `/approve spec`. **Tú no puedes aprobar.**

Nunca inventes requisitos que el humano no haya dado. Lo que no esté definido va marcado como pendiente y bloquea la aprobación.
