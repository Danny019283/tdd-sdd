# tdd-sdd

Harness para desarrollar con Claude Code (y opencode) guiado por **casos de uso (SDD)** y **TDD**, con bloqueo real por hooks.

## Idea

- El humano define un **caso de uso** (plantilla de 9 secciones) de forma interactiva → `spec.md`.
- De la spec aprobada sale un `plan.md` con una **checklist**; cada check declara qué cubre y qué archivos puede tocar.
- Por cada check: **rojo → verde → parada de revisión → `/approve check` → commit**. El refactor nunca es automático.
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
| `SPEC_FROZEN` / `PLAN_FROZEN` / `HARNESS_FILE_PROTECTED` | Editar spec/plan aprobados o el estado del harness |
| `COMMIT_REQUIRES_APPROVAL` | Commit sin check aprobado por el humano |
| `STOP_REQUIRES_REVIEW` | Terminar en verde sin la parada de revisión |
| `PUSH_REQUIRES_COMPLETE_PLAN` / `PUSH_REQUIRES_FINAL_APPROVAL` | Push anticipado |

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

- Desde `Bash` se detectan redirecciones (`>`, `>>`), `tee`, `sed -i`, `cp`, `mv` y `rm` hacia archivos del proyecto; una escritura indirecta (un script, `python -c`, `git checkout`) no se detecta. Una redirección de salida a un archivo del proyecto también se evalúa como edición.
- Rutas del scope guard por coincidencia exacta (sin globs).
- La API del plugin de opencode está escrita contra la documentación pública y no se ha probado dentro de opencode.
