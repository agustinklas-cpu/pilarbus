# PilarBus — Ecosistema Móvil de Transporte Público

## Objetivo
Aplicación móvil y plataforma web para consultar recorridos de colectivos en tiempo real, alertas de desvíos, integración con servicios disponibles y sistema de reclamos.

## Metodología de trabajo
Se propone Scrum con sprints cortos para planificar, construir y revisar incrementos con usuarios beta. El tablero Kanban permite visualizar el flujo diario. El límite WIP de `In Progress` es de **3 tarjetas**: si se alcanza, el equipo ayuda a terminar tareas antes de comenzar nuevas.

## Estimación
Las funcionalidades se estiman con Story Points (2, 5 y 8) según complejidad, esfuerzo relativo, incertidumbre y riesgo. No equivalen a horas. Se puede usar Planning Poker para acordar estimaciones. La previsión de calendario se ajustará cuando exista una velocidad real del equipo (puntos completados por sprint).

## Pull Requests
1. Crear una rama por tarea (`feature/nombre-tarea`).
2. Hacer commits pequeños y descriptivos.
3. Abrir un Pull Request hacia `main` explicando el objetivo, cambios y pruebas.
4. Esperar la ejecución de las validaciones automáticas y una revisión de otro integrante.
5. Corregir fallos antes de integrar. No incluir secretos, tokens ni datos personales en el repositorio.

## CI/CD
El workflow en `.github/workflows/ci.yml` se ejecuta en Pull Requests y en cambios a `main`. Como aún no se especificó el lenguaje o framework de la aplicación, incluye una validación de estructura que debe reemplazarse por los comandos reales de instalación, build, lint y tests. La publicación (deploy) requiere configurar el hosting, los secretos y el entorno de producción. No se debe afirmar que el despliegue está automatizado hasta probarlo en el entorno real.

## Estructura del material
- `Informe_Caso_Estudio_PilarBus.pdf`: informe para entregar.
- `kanban_cards.csv`: ocho tarjetas iniciales para cargar en Trello.
- `.github/workflows/ci.yml`: ejemplo inicial de CI.
- `trello_board_setup.md`: instrucciones de configuración del tablero.

- link de nuestro prototipo de pagina
https://pilar-bus-urbano--agustinklas.replit.app

link tello: https://trello.com/invite/b/6ae93f95bc44c25dfc381670/ATTI47041798eb959ad1c889c622abd6b5903D4624E3/pilarbus-desarrollo-agil-🚍
