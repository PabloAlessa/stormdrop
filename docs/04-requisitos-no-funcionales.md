# 04 · Requisitos no funcionales

## RNF-REN · Rendimiento
| ID | Requisito |
|---|---|
| RNF-REN-01 | 30 FPS estables en PS4 y Xbox One base; 60 FPS o más en PC recomendado |
| RNF-REN-02 | Requisitos mínimos de PC: Intel HD 4000, Core i3 a 2,4 GHz, 4 GB de RAM, Windows 7 de 64 bits |
| RNF-REN-03 | Escalado gráfico: preajustes, resolución 3D variable, distancia de visión, sombras y post-procesado configurables |
| RNF-REN-04 | Con 100 jugadores y cientos de estructuras se mantiene el objetivo de FPS: niveles de detalle, recorte y agrupación de estructuras |
| RNF-REN-05 | Carga del mapa al inicio de partida en menos de 30 s en consola |
| RNF-REN-06 | Uso de memoria compatible con consolas de 8 GB y, desde 2018, con móviles de 3 GB |

## RNF-RED · Red
| ID | Requisito |
|---|---|
| RNF-RED-01 | Arquitectura cliente-servidor autoritativa con servidor dedicado por partida |
| RNF-RED-02 | Tick rate ≈20 Hz al lanzamiento, subido a 30 Hz en 2018 y adaptable según la fase de la partida |
| RNF-RED-03 | Jugable con latencias de hasta 100 ms; predicción en el cliente para movimiento y construcción |
| RNF-RED-04 | Replicación por relevancia: sólo se envían los actores cercanos o visibles |
| RNF-RED-05 | Reconexión a una partida en curso tras una desconexión breve |
| RNF-RED-06 | Regiones: Norteamérica Este y Oeste, Europa, Brasil, Asia y Oceanía |

## RNF-ESC · Escalabilidad y disponibilidad
| ID | Requisito |
|---|---|
| RNF-ESC-01 | Escalado automático de servidores de partida en la nube según la demanda (millones de concurrentes) |
| RNF-ESC-02 | Servicios de cuenta, emparejamiento e inventario escalables horizontalmente |
| RNF-ESC-03 | Colas de acceso cuando la demanda supere la capacidad, en lugar de caídas |
| RNF-ESC-04 | Disponibilidad ≥ 99,5 % fuera de mantenimiento programado |
| RNF-ESC-05 | Parches sin tiempo de inactividad prolongado; mantenimiento anunciado |

## RNF-SEG · Seguridad y antitrampas
| ID | Requisito |
|---|---|
| RNF-SEG-01 | El servidor valida movimiento, disparos, daño y construcción (nunca se confía en el cliente) |
| RNF-SEG-02 | Antitrampas en el cliente (en 2017–2018 se usaron BattlEye y Easy Anti-Cheat) |
| RNF-SEG-03 | Expulsiones por cuenta y hardware; sistema de denuncias con revisión |
| RNF-SEG-04 | Autenticación en dos pasos opcional (incentivada con recompensas en 2018) |
| RNF-SEG-05 | Protección de compras y reembolsos limitados |
| RNF-SEG-06 | Cumplimiento de privacidad: RGPD (desde mayo de 2018) y COPPA para menores |

## RNF-USA · Usabilidad y accesibilidad
| ID | Requisito |
|---|---|
| RNF-USA-01 | Un jugador nuevo puede completar su primera partida sin tutorial obligatorio |
| RNF-USA-02 | Información codificada por color y por forma (rareza, escudo y vida) |
| RNF-USA-03 | Modos para daltónicos y visualización de efectos de sonido |
| RNF-USA-04 | Remapeo completo de controles en PC y consola |
| RNF-USA-05 | Subtítulos y textos con tamaño legible en pantallas de TV y móviles |

## RNF-LOC · Localización
| ID | Requisito |
|---|---|
| RNF-LOC-01 | Textos e interfaz en al menos 12 idiomas, incluidos español de España y de Latinoamérica |
| RNF-LOC-02 | Precios regionales en la tienda |

## RNF-CAL · Calidad y mantenibilidad
| ID | Requisito |
|---|---|
| RNF-CAL-01 | Tasa de fallos del cliente inferior al 1 % de las sesiones, con informe automático de errores |
| RNF-CAL-02 | Parches de contenido cada 1–2 semanas y temporadas de ≈10 semanas |
| RNF-CAL-03 | Parámetros de equilibrio (daño, rarezas, botín) ajustables desde el servidor sin parche de cliente |
| RNF-CAL-04 | Telemetría de cada partida para equilibrar armas y detectar problemas |

## RNF-LEG · Legal y cumplimiento
| ID | Requisito |
|---|---|
| RNF-LEG-01 | Clasificación por edad PEGI 12 / ESRB Teen: violencia sin sangre |
| RNF-LEG-02 | Cumplimiento de las normas de cada tienda (Sony, Microsoft, Nintendo, Apple y Google) |
| RNF-LEG-03 | Información clara de los objetos y precios de la tienda; sin cajas de botín aleatorias en el modo BR |
| RNF-LEG-04 | Términos de uso, política de privacidad y gestión de cuentas de menores |
