# 06 · Arquitectura técnica

## 1. Vista general

```
                    ┌──────────────── Servicios de plataforma (nube) ────────────────┐
 Cliente ──HTTPS──▶ │ Cuentas · Amigos/Presencia · Emparejamiento · Inventario/Tienda │
 (UE4)              │ Estadísticas · Desafíos · Noticias · Telemetría · Moderación     │
   │                └───────────────────────────┬────────────────────────────────────┘
   │                                            │ asigna servidor
   └──────────UDP (replicación UE4)──────▶ Servidor dedicado de partida (100 jugadores)
                                            │ resultados, XP, estadísticas
                                            ▼
                                      Servicios de plataforma
```

## 2. Componentes

| Componente | Responsabilidad | Tecnología de la época (pública o probable) |
|---|---|---|
| Cliente | Render, entrada, interfaz, predicción, audio | Unreal Engine 4 (C++ y Blueprints) |
| Servidor dedicado | Simulación autoritativa de la partida, física, daño, construcción, botín y tormenta | Servidor UE4 *headless* en Linux |
| Emparejamiento | Colas por modo, región y plataforma; asigna servidor | Servicio propio con escalado en la nube |
| Orquestación de servidores | Reserva y arranque de instancias por demanda | Nube (AWS), miles de instancias |
| Cuentas e identidad | Cuenta de Epic, vinculación con PSN, Xbox Live, Nintendo, Apple y Google | Servicios en la nube con base de datos distribuida |
| Inventario y tienda | Cosméticos, V-Bucks, compras, pase de batalla | Integración con las tiendas de cada plataforma |
| Social | Amigos, grupos, invitaciones, presencia y voz | XMPP para presencia; chat de voz integrado |
| Telemetría y análisis | Eventos de partida, rendimiento y economía | *Pipeline* de datos en la nube (≈2 PB/mes en 2018) |
| Contenido en vivo | Noticias del lobby, rotación de tienda, configuración remota | CDN y servicio de configuración |
| Antitrampas | Detección en el cliente y validación en el servidor | BattlEye / Easy Anti-Cheat |

## 3. Red y replicación

- Servidor autoritativo: el cliente sólo envía entradas y acciones, y el servidor decide.
- **Predicción en el cliente** del movimiento y de la colocación de piezas, con corrección del servidor.
- **Relevancia**: el servidor sólo replica a cada cliente los actores cercanos.
- Las estructuras se agrupan para reducir el ancho de banda, porque una partida puede tener miles de piezas.
- **Tick rate** variable: más alto al final de la partida, cuando quedan pocos jugadores y el combate es más intenso.
- Detección de impactos con compensación de latencia, validada en el servidor.

## 4. Optimización del cliente

- Niveles de detalle (LOD) para personajes, edificios y vegetación; reducción de la frecuencia de animación a distancia.
- *Streaming* de niveles: el mapa se carga por zonas.
- Instanciado de vegetación, recorte por visibilidad y por distancia.
- Escalas de calidad por plataforma; en móvil, sombras y efectos simplificados y resolución dinámica.

## 5. Despliegue y operación

| Práctica | Detalle |
|---|---|
| Ritmo de parches | Actualizaciones cada 1–2 semanas; *hotfixes* de servidor sin parche de cliente |
| Configuración remota | Equilibrio de armas, botín y modos temporales cambiables desde el servidor |
| Mantenimiento | Ventanas anunciadas; colas de acceso ante picos de demanda |
| Monitorización | Paneles de concurrencia, errores, latencia y emparejamiento |
| Respuesta a incidentes | Hubo caídas en febrero de 2018 por picos de 3,4 M concurrentes; se publicó un análisis posterior con mejoras en bases de datos y en el servicio de cuentas |

## 6. Datos principales

| Entidad | Campos clave |
|---|---|
| Cuenta | id, nombre visible, plataformas vinculadas, 2FA, región |
| Perfil de juego | nivel, XP, estrellas, nivel del pase de batalla, estadísticas por modo |
| Inventario | cosméticos, equipamiento del casillero, V-Bucks |
| Partida | id, servidor, modo, región, jugadores, eventos y resultado |
| Evento de telemetría | marca de tiempo, partida, jugador, tipo (disparo, daño, eliminación, botín, construcción) y datos |
