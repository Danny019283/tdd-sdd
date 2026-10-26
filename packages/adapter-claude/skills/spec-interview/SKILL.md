---
name: spec-interview
description: Úsalo al rellenar spec.md de un caso de uso. Entrevista interactiva sección por sección; repregunta cuando falta claridad y nunca inventa requisitos.
---

# Entrevista de spec (caso de uso)

La spec es la única fuente de verdad. Se rellena **con el humano**, no por el modelo.

## Reglas
1. Una sección a la vez, en el orden de la plantilla (1 Identificación … 9 Requisitos no funcionales).
2. Pregunta lo mínimo necesario por sección. Si la respuesta es vaga ("que sea rápido", "validar bien"), **repregunta** hasta que sea verificable (un número, un estado, un código de error).
3. No rellenes huecos por tu cuenta. Lo no resuelto queda como `pendiente` y se lista al final; `/approve spec` rechaza la spec mientras quede alguna línea marcada así.
4. Escribe la sección en `spec.md` solo después de que el humano la confirme.

## Qué debe quedar por sección
- **Identificación:** nombre verbo+objeto, objetivo, actor principal y secundarios.
- **Alcance:** incluye / no incluye / supuestos.
- **Precondiciones:** lo que ya es cierto (actor, datos, sistema). Si el sistema debe comprobarlo y responder con error, es un flujo de excepción, no precondición.
- **Disparador:** UN solo evento (no una secuencia).
- **Flujo principal:** pasos `FP-1`, `FP-2`… alternando actor y sistema.
- **Flujos alternativos y de excepción:** referencian el paso (`FA-3a`).
- **Postcondiciones:** estado en éxito y en fallo.
- **Reglas de negocio:** `RN-1`… validaciones y límites.
- **Requisitos no funcionales:** seguridad, rendimiento, auditoría.

## Al terminar
Pide al humano revisar `spec.md` completa y ejecutar `/approve spec`. Después redacta `plan.md`:
un check por comportamiento verificable, cada uno con `cubre:` (FP-n, FA-n, RN-n) y `archivos:` (los únicos que podrá tocar).
Etiqueta los checks que no cambian comportamiento: `- [ ] 5. (refactor) Refactor DRY` (parte de tests en verde) y `- [ ] 9. (verificación) Integración real` (solo añade pruebas). Un refactor que prepare una abstracción antes de un caso parecido va primero.
La redacción la hace el agente `redactor` con las respuestas ya recogidas; las preguntas al humano las haces tú.
Los tests de cada check apuntan a la entrada/salida pública del caso de uso, no a métodos privados.
Pide `/approve plan`.
