export const SPEC_TEMPLATE = `# Caso de uso: {{id}}

<!-- Plantilla de caso de uso. Rellena cada sección con el humano; sustituye "pendiente". -->

## 1. Identificación
pendiente
<!-- Nombre (verbo + objeto, ej. "Iniciar sesión"), objetivo, actor principal y secundarios -->

## 2. Alcance
pendiente
<!-- Incluye / No incluye / Supuestos -->

## 3. Precondiciones
pendiente
<!-- Del actor, de datos, del sistema. Si el sistema debe comprobarla y devolver error, es un flujo de excepción -->

## 4. Disparador
pendiente
<!-- UN solo evento que inicia el caso de uso: quién lo origina y qué lo activa -->

## 5. Flujo principal
pendiente
<!-- Pasos numerados FP-1, FP-2... alternando actor y sistema -->

## 6. Flujos alternativos y de excepción
pendiente
<!-- Variaciones y errores referenciando el paso, ej. FA-3a -->

## 7. Postcondiciones
pendiente
<!-- Estado del sistema en éxito y en fallo -->

## 8. Reglas de negocio
pendiente
<!-- RN-1, RN-2... validaciones y restricciones -->

## 9. Requisitos no funcionales
pendiente
<!-- Seguridad, rendimiento, auditoría -->
`;

export const PLAN_TEMPLATE = `# Plan: {{id}}

<!-- Un check por comportamiento verificable. Cada check declara qué elementos de la spec cubre
     y los únicos archivos que puede tocar. Los tests apuntan a la entrada/salida del caso de uso.
     Etiquetas opcionales tras el número: (refactor) = limpieza sin cambiar comportamiento, parte de tests en verde;
     (verificación) = solo añade pruebas sobre código existente. Sin etiqueta = comportamiento nuevo (rojo → verde). -->

- [ ] 1. Título del primer check
  - cubre: FP-1
  - archivos: src/ejemplo.ts, tests/ejemplo.test.ts
`;
