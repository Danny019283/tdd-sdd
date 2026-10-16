---
name: tdd-cycle
description: Úsalo al implementar un check del plan. Ciclo rojo → verde → parada de revisión con compuerta humana; el refactor solo lo habilita el humano.
---

# Ciclo TDD por check

Trabajas **un check a la vez**: el primero sin marcar en `plan.md`. Solo puedes tocar los archivos que ese check declara; el harness bloquea el resto.

## Pasos
1. **Rojo.** Escribe el test del check contra la entrada/salida pública del caso de uso. Ejecuta `tdd-sdd test`. Debe fallar por la razón correcta (comportamiento ausente, no error de sintaxis). El harness pasa a fase `red`.
2. **Verde.** Implementa lo mínimo. Ejecuta `tdd-sdd test` hasta que pase. El harness pasa a `green`.
3. **Parada de revisión.** Ejecuta `tdd-sdd review` y presenta al humano: qué cambió, qué elementos de la spec cubre (FP/FA/RN), archivos tocados y salida de los tests. **Detente y espera.**
4. El humano ejecuta `/approve check`. El harness marca el check y habilita el commit.
5. **Commit** de ese check (un commit por check; mensaje que cite los elementos de spec cubiertos).
6. Siguiente check, de vuelta al paso 1.

## Reglas
- No edites `spec.md`, `plan.md` ni `.tdd-sdd/state.json` una vez aprobados.
- No refactorices por tu cuenta. Si crees que hace falta, proponlo al humano en la parada de revisión; él decide con `/refactor`.
- Durante el refactor los tests están congelados; termina con `tdd-sdd refactor-done`.
- Si necesitas un archivo fuera de la lista del check, pide al humano ampliar el plan.
- Cuando el plan esté completo, pide `/approve final`; solo entonces se permite `git push`.
