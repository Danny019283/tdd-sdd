---
description: El humano habilita un refactor del check actual (tests congelados)
---

El harness ya procesó este comando. Si el mensaje `[tdd-sdd]` confirma que el refactor está habilitado:

- Refactoriza solo lo que el humano pidió, sin cambiar comportamiento.
- No toques los tests: son la red de seguridad.
- Al terminar ejecuta `tdd-sdd refactor-done` (corre los tests y vuelve a la revisión).
