---
name: tdd-cycle
description: Úsalo al implementar el plan. La sesión principal orquesta cuatro agentes (redactor, desarrollador, revisor, solucionador); cada check sigue rojo → verde → revisión, y el humano solo ve resultados y decide lo delicado.
---

# Ciclo TDD por check (orquestación)

Tú, la sesión principal, **orquestas**: no escribes código ni apruebas. Lanzas a cada agente con la herramienta Agent y le pasas el contexto que necesita (agentes `tdd-sdd:<nombre>`).

| Agente | Cuándo | Modelo |
|---|---|---|
| `redactor` | redactar `spec.md` y `plan.md` con lo que el humano respondió | opus 5.5, esfuerzo medio |
| `desarrollador` | implementar el check en curso | sonnet 5.5, esfuerzo alto |
| `revisor` | tras `tdd-sdd review`: corre tests y aprueba el check | sonnet 5.5, esfuerzo alto |
| `solucionador` | ante un `BLOQUEADO:` del desarrollador | sonnet 5.5, esfuerzo alto |

## Por cada check (el primero sin marcar en `plan.md`)
1. **Desarrollador** → lleva el check a verde y ejecuta `tdd-sdd review`. Devuelve qué cambió, qué elementos de la spec cubre y la salida de tests.
2. **Revisor** → ejecuta `tdd-sdd approve-check` (corre los tests; solo con tests en verde marca el check y habilita el commit) y devuelve `APROBADO:` o `RECHAZADO:`.
3. Muestra al humano **una línea** de resultado (`✓ check 3 aprobado · cubre FP-2, RN-1 · 12 tests`) y **sigue sin esperar respuesta**.
4. **Desarrollador** → commit del check aprobado (uno por check, citando los elementos de spec). Siguiente check.
- Si el revisor devuelve `RECHAZADO` por tests en rojo: **detente** y enseña el resultado al humano. Si es por cobertura o alcance, devuelve el check al desarrollador con lo que debe corregir.
- El humano puede seguir usando `/approve check`, `/refactor` y `/override` cuando quiera.

## Tipos de check (etiqueta en `plan.md`)
- Sin etiqueta: rojo → verde. `tdd-sdd test` debe fallar por comportamiento ausente.
- `(refactor)`: `tdd-sdd test` en verde abre el refactor (producción editable, tests congelados); termina con `tdd-sdd refactor-done`. Para preparar una abstracción antes de añadir un caso parecido, pon el check `(refactor)` **primero** en el plan.
- `(verificación)`: solo pruebas sobre código existente; si pasan a la primera, directo a revisión. Si fallan, es un defecto real y entra en rojo.

## Cuando algo se atasca
1. El desarrollador devuelve `BLOQUEADO: ...` → lanza al **solucionador** con ese texto.
2. `RESUELTO:` → relanza al desarrollador con la acción indicada (máximo 2 rondas por bloqueo).
3. `ESCALAR:` (o 2 rondas sin éxito) → pregunta al humano con AskUserQuestion, con las opciones y la recomendación del solucionador. Es delicado y va al humano: cambios de spec, de `config.json` o del comando de tests, añadir/quitar/dividir checks, cambiar lo que cubre un check, tocar tests en verde, dependencias, borrado de datos, credenciales o seguridad.
- Solo el solucionador puede ajustar la lista `archivos:` del check en curso (`tdd-sdd amend-files`).

## Reglas
- El comando de tests sale solo de `.tdd-sdd/config.json` y no se puede sustituir. Un fallo de configuración se escala al humano.
- No edites `spec.md`, `plan.md` ni `.tdd-sdd/state.json` una vez aprobados.
- Notas y documentación (`*.md`, `*.txt`, `docs/**`) se pueden editar siempre.
- Cuando el plan esté completo, pide `/approve final`; solo entonces se permite `git push`.
