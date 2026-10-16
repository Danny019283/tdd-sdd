---
description: El humano aprueba la spec, el plan, el check actual o el cierre final
argument-hint: spec | plan | check | final
---

Este comando lo procesa el harness antes de llegar al modelo. Si lo estás leyendo como instrucción, la aprobación ya se aplicó (o se rechazó con un motivo en el mensaje `[tdd-sdd]`).

Reporta el resultado al humano y continúa según la nueva fase (skill `tdd-cycle`). Si el mensaje dice `NO APLICADO`, explica qué falta y corrígelo con el humano.
