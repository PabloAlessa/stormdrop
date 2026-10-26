# Documentación base · Fortnite Battle Royale (2017–2018)

Documentación de referencia del producto **Fortnite Battle Royale** en su primera etapa (lanzamiento en septiembre de 2017 hasta el final de 2018, temporadas 1 a 6 aproximadamente).
Está escrita como si fuera la documentación de arranque del proyecto: qué se quería conseguir, para quién, qué entraba y qué no, y qué tenía que cumplir el juego.

Sirve como **referencia de diseño para Stormdrop**. Describe mecánicas, sistemas y requisitos, que son ideas de género y no están protegidas.
No autoriza a copiar nombres, personajes, mapas, logotipos, sonidos ni ningún otro recurso de Epic Games.

> **Sobre la exactitud.** Los datos proceden de información pública de la época: notas de parche, comunicados y documentación de la comunidad.
> Los valores numéricos (daño, tiempos, radios, rarezas) cambiaron muchas veces entre parches. Están indicados como aproximados (≈) cuando no hubo un valor estable.
> Los documentos de objetivos, alcance y requisitos son una **reconstrucción**: Epic nunca publicó sus documentos internos.

## Índice

| Documento | Contenido |
|---|---|
| [01 · Visión y objetivos](01-vision-y-objetivos.md) | Contexto, visión, objetivos de negocio y de producto, público, pilares de diseño y métricas de éxito |
| [02 · Alcance](02-alcance.md) | Qué entra y qué no, plataformas, modos, hitos y cronología 2017–2018 |
| [03 · Requisitos funcionales](03-requisitos-funcionales.md) | Requisitos numerados por sistema: partida, movimiento, combate, construcción, botín, tormenta, interfaz, social y tienda |
| [04 · Requisitos no funcionales](04-requisitos-no-funcionales.md) | Rendimiento, red, escalabilidad, disponibilidad, seguridad, antitrampas, accesibilidad, localización y aspectos legales |
| [05 · Diseño de juego](05-diseno-de-juego.md) | Bucle de juego, tablas de armas y consumibles, construcción, tormenta, mapa, progresión y economía |
| [06 · Arquitectura técnica](06-arquitectura-tecnica.md) | Cliente, servidores dedicados, emparejamiento, servicios de plataforma, telemetría y despliegue |
| [07 · Riesgos y comparativa con Stormdrop](07-riesgos-y-comparativa.md) | Riesgos del proyecto original y qué tiene o le falta a Stormdrop para equipararse |
| [08 · Matriz de trazabilidad](08-trazabilidad.md) | Estado de cada requisito en Stormdrop v1.1.0 y dónde está implementado |
| [09 · Despliegue y operación](09-despliegue.md) | Entornos, pipeline CI/CD, checklist de versión, operación y fase de servicios en línea |

## Glosario

| Término | Significado |
|---|---|
| BR | Battle royale: muchos jugadores caen en un mapa y gana el último en pie |
| POI | Punto de interés: zona con nombre del mapa (pueblo, fábrica…) |
| Tormenta | Zona que se cierra por fases y daña a quien queda fuera |
| Autobús de batalla | Vehículo aéreo desde el que los jugadores saltan al inicio |
| DBNO | *Down But Not Out*: derribado pero no eliminado (en dúos y escuadras) |
| Mats | Materiales de construcción: madera, piedra (ladrillo) y metal |
| Pase de batalla | Progresión de temporada con recompensas cosméticas (gratuita y de pago) |
| V-Bucks | Moneda virtual del juego |
| LTM | *Limited Time Mode*: modo de juego temporal |
| Tick rate | Frecuencia con la que el servidor simula y envía el estado |
