# Padel Brositos

Herramienta móvil para torneos americano y mexicano de pádel. Arma las rondas, anota resultados con un toque y muestra la tabla en vivo. Los datos viven en un Google Sheet.

Sitio estático (HTML, CSS y JS, sin build). Se publica con GitHub Pages.

## Qué hace

- **Americano**: arma todas las rondas desde el inicio. Con 8, 12, 16… jugadores y una cancha por cada 4, cada uno juega una vez con cada compañero. Con descansos, se reparten parejo y se evita descansar dos rondas seguidas.
- **Mexicano**: ronda 1 al azar; desde la 2, cada grupo de 4 según la tabla juega 1.º y 4.º contra 2.º y 3.º.
- Partidos a 16, 21, 24 o 32 puntos (la otra pareja se completa sola) o puntos libres.
- Tabla con puntos, ganados, diferencia y flechas de subida o bajada; ficha de cada jugador con sus partidos.
- Podio con confeti al terminar, reloj de ronda que vibra, compartir la tabla por WhatsApp.
- Clave opcional para anotar: todos ven, solo el organizador escribe.
- Sin Sheet funciona igual, guardado en el teléfono.

## Conectar el Google Sheet

1. Crea un Google Sheet vacío (por ejemplo "Padel Brositos").
2. **Extensiones → Apps Script**. Borra lo que haya y pega el contenido de [`apps-script/Code.gs`](apps-script/Code.gs). Guarda.
3. **Implementar → Nueva implementación → Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
4. Autoriza los permisos y copia la URL que termina en `/exec`.
5. Pégala en `config.js` (`SCRIPT_URL`) y sube el cambio. También se puede pegar desde la app en **Torneo → Google Sheet** sin tocar el código.

El script crea las pestañas `torneo`, `jugadores`, `partidos` y `tabla`. Cada torneo nuevo guarda el anterior en una pestaña `archivo …`. Si corriges un resultado a mano en `partidos`, la tabla y la web se actualizan solas.

Si cambias `Code.gs`, publica una versión nueva en **Implementar → Administrar implementaciones → Editar → Versión nueva** (la URL no cambia).

## Local

```bash
python3 -m http.server 5178
```
