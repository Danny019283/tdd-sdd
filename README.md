# tdd-sdd

Harness para desarrollar con Claude Code (y opencode) guiado por **casos de uso (SDD)** y **TDD**, con bloqueo real por hooks.

## Idea

- El humano define un **caso de uso** (plantilla de 9 secciones) de forma interactiva → `spec.md`.
- De la spec aprobada sale un `plan.md` con una **checklist**; cada check declara qué cubre y qué archivos puede tocar.
- Por cada check: **rojo → verde → parada de revisión → aprobación del revisor → commit**. Los checks `(refactor)` parten de tests en verde y los `(verificación)` solo añaden pruebas; ver "Tipos de check".
- Al completar la checklist y recibir `/approve final`, se permite el `push`.

La IA no puede aprobar nada: `/approve`, `/override` y `/refactor` solo los procesa el hook `UserPromptSubmit` (mensajes del humano).

## Estructura

| Paquete | Rol |
|---|---|
| `packages/core` | Lógica pura: validación de spec, plan.md, ciclo, reglas allow/deny |
| `packages/cli` | Estado en disco, comandos (`init`, `test`, `review`…), manejador de hooks, build del binario |
| `packages/adapter-claude` | Plugin de Claude Code: hooks, comandos, skills, binario empaquetado |
| `packages/adapter-opencode` | Plugin de opencode sobre el mismo núcleo |

## Reglas que hace cumplir

| Regla | Qué bloquea |
|---|---|
| `PRODUCTION_REQUIRES_RED_TEST` | Editar código de producción sin test en rojo |
| `OUT_OF_SCOPE` | Editar archivos fuera de la lista del check actual |
| `TESTS_FROZEN_AFTER_GREEN` / `TESTS_FROZEN_IN_REFACTOR` | Tocar tests tras verde o durante refactor |
| `SPEC_FROZEN` / `PLAN_FROZEN` / `CONFIG_FROZEN` / `HARNESS_FILE_PROTECTED` | Editar spec/plan/config aprobados o el estado del harness |
| `ROLE_NOT_ALLOWED` | `approve-check` fuera del agente `revisor`, o `amend-files` fuera del `solucionador` |
| `COMMIT_REQUIRES_APPROVAL` | Commit sin check aprobado por el humano |
| `STOP_REQUIRES_REVIEW` | Terminar en verde sin la parada de revisión |
| `PUSH_REQUIRES_COMPLETE_PLAN` / `PUSH_REQUIRES_FINAL_APPROVAL` | Push anticipado |

Siempre se pueden editar `*.md`, `*.txt` y `docs/**` (más los globs que `.tdd-sdd/config.json` declare en `alwaysAllowed`, congelado al aprobar la spec).

## Tipos de check

Etiqueta opcional tras el número en `plan.md` (se aprueba con el plan, así que la IA no puede cambiarla):

| Etiqueta | Arranque | Para qué |
|---|---|---|
| (ninguna) | `tdd-sdd test` debe fallar (rojo) | comportamiento nuevo |
| `(refactor)` | `tdd-sdd test` en verde abre el refactor; tests congelados; termina con `refactor-done` | limpieza DRY, o un refactor previo que prepare una abstracción (ponlo primero en el plan) |
| `(verificación)` | si los tests nuevos pasan, directo a verde; si fallan, rojo normal; sin tocar producción | pruebas de integración sobre código ya hecho |

## Agentes (Claude Code)

La sesión principal orquesta; cada rol es un agente del plugin con su modelo:

| Agente | Modelo | Hace |
|---|---|---|
| `redactor` | opus 5.5, esfuerzo medio | `spec.md` y `plan.md` |
| `desarrollador` | sonnet 5.5, alto | un check: rojo → verde → `tdd-sdd review` y commit |
| `revisor` | sonnet 5.5, alto | `tdd-sdd approve-check`: corre los tests y aprueba solo si pasan |
| `solucionador` | sonnet 5.5, alto | diagnostica bloqueos; puede ajustar los `archivos:` del check en curso (`tdd-sdd amend-files`); escala al humano lo delicado |

El humano ve una línea por check aprobado sin que se detenga el trabajo; solo se para si fallan los tests o el solucionador escala. Spec, plan y `/approve final` siguen siendo del humano.
Los comandos de rol los acepta el hook solo si `agent_type` es el correcto; el hook deja un permiso de un solo uso (60 s) en `state.json` y el CLI lo consume. `approvals.log` y `amendments.log` registran quién y cuándo.

## Instalar en Claude Code

```
/plugin marketplace add /ruta/a/claude-tunning
/plugin install tdd-sdd@tdd-sdd
```

Luego `/start-dev` en el proyecto.

## Desarrollo

```
pnpm install
pnpm test          # todos los paquetes
pnpm --filter @tdd-sdd/cli build   # regenera packages/adapter-claude/bin/tdd-sdd.mjs
```

## Limitaciones conocidas (MVP)

- El comando de tests viene de `.tdd-sdd/config.json` y la IA solo puede escribirlo mientras la spec es borrador; `/approve plan` lo muestra para que el humano lo vea. El rojo se registra por código de salida: un fallo de configuración se vería como rojo, así que la skill obliga a leer la salida y a confirmarlo en la parada de revisión.
- Desde `Bash` se detectan redirecciones (`>`, `>>`), `tee`, `sed -i`, `cp`, `mv` y `rm` hacia archivos del proyecto; una escritura indirecta (un script, `python -c`, `git checkout`) no se detecta. Una redirección de salida a un archivo del proyecto también se evalúa como edición.
- Rutas del scope guard por coincidencia exacta (sin globs); `alwaysAllowed` sí admite `*`, `**` y `?`.
- La identidad por rol depende de que Claude Code envíe `agent_id`/`agent_type` en los hooks; `adapter-opencode` no tiene roles y conserva `/approve check`.
- Un comando de rol lanzado por una vía indirecta (`sh -c`, script) no lo reconoce el hook, pero el CLI lo rechaza al no haber permiso vigente.
- La API del plugin de opencode está escrita contra la documentación pública y no se ha probado dentro de opencode.
