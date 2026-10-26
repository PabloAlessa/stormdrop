# 03 · Requisitos funcionales

Prioridad: **M** = imprescindible para el lanzamiento, **S** = muy deseable, **C** = posterior al lanzamiento.

## RF-PAR · Flujo de partida
| ID | Requisito | Prioridad |
|---|---|---|
| RF-PAR-01 | El jugador elige un modo (Solo, Dúos o Escuadras) y entra en emparejamiento desde el lobby | M |
| RF-PAR-02 | El sistema forma partidas de hasta 100 jugadores por región y, cuando sea posible, por plataforma o *input* | M |
| RF-PAR-03 | Antes de la partida, los jugadores esperan en una **isla previa** donde pueden moverse, disparar con daño desactivado y construir | M |
| RF-PAR-04 | La partida comienza con todos los jugadores en el autobús, que cruza el mapa en una ruta aleatoria | M |
| RF-PAR-05 | El jugador puede saltar del autobús en cualquier momento tras abrir las puertas; al final de la ruta es expulsado | M |
| RF-PAR-06 | Gana el último jugador o equipo vivo; se muestra la pantalla de victoria con estadísticas | M |
| RF-PAR-07 | Al ser eliminado, el jugador puede espectar a su eliminador o a su equipo, volver al lobby o salir | M |
| RF-PAR-08 | Al terminar se calculan la experiencia, el progreso de desafíos y las estadísticas | S |

## RF-MOV · Movimiento
| ID | Requisito | Prioridad |
|---|---|---|
| RF-MOV-01 | Caminar, correr, saltar, agacharse y nadar | M |
| RF-MOV-02 | Caída libre controlable con picado; el planeador se despliega automáticamente a una altura mínima o manualmente | M |
| RF-MOV-03 | Daño por caída a partir de ≈3 pisos de altura | M |
| RF-MOV-04 | Cámara en tercera persona sobre el hombro; al apuntar se acerca; la mira telescópica pasa a vista de lente | M |
| RF-MOV-05 | Movimiento sobre estructuras construidas (rampas, suelos, techos) | M |

## RF-COM · Combate
| ID | Requisito | Prioridad |
|---|---|---|
| RF-COM-01 | Armas de impacto instantáneo con dispersión ("bloom") que aumenta al disparar y moverse | M |
| RF-COM-02 | Francotiradores con proyectil físico y caída de bala | M |
| RF-COM-03 | Multiplicador de daño a la cabeza por arma | M |
| RF-COM-04 | Escudo (hasta 100) que absorbe el daño antes que la vida (hasta 100) | M |
| RF-COM-05 | Recarga por cargador o cartucho a cartucho según el arma; tiempo de equipamiento al cambiar de arma | M |
| RF-COM-06 | Explosivos: granadas, lanzacohetes y lanzagranadas, con daño en área y a estructuras | M |
| RF-COM-07 | Números de daño, marcador de impacto e indicador de dirección del daño recibido | M |
| RF-COM-08 | En dúos y escuadras, derribo (DBNO) con sangrado progresivo, reanimación por un compañero y eliminación definitiva | M |
| RF-COM-09 | Fuego amigo desactivado | M |

## RF-CON · Construcción y recolección
| ID | Requisito | Prioridad |
|---|---|---|
| RF-CON-01 | Cuatro piezas en rejilla: muro, suelo, escalera y techo piramidal | M |
| RF-CON-02 | Tres materiales con distinta vida y tiempo de construcción: madera, ladrillo y metal | M |
| RF-CON-03 | Cada pieza cuesta 10 de material; máximo 999 por tipo | M |
| RF-CON-04 | La vida de una pieza crece durante su construcción; las piezas reciben daño y se destruyen | M |
| RF-CON-05 | **Edición** de piezas: puertas, ventanas, medias paredes, arcos y escaleras rotadas, seleccionando casillas | M |
| RF-CON-06 | Integridad estructural: las piezas sin apoyo conectado al suelo se derrumban | M |
| RF-CON-07 | El pico recolecta material de cualquier objeto del entorno; hay un **punto débil** que dobla el daño | M |
| RF-CON-08 | Vista previa de la pieza en azul si se puede colocar y en rojo si no | M |
| RF-CON-09 | Modo turbo: colocación continua manteniendo el botón | S |

## RF-BOT · Botín e inventario
| ID | Requisito | Prioridad |
|---|---|---|
| RF-BOT-01 | Inventario de 5 ranuras más el pico; munición y materiales aparte | M |
| RF-BOT-02 | Botín en el suelo, cofres (sonido y brillo), cajas de munición, entregas de suministros y, desde 2018, llamas | M |
| RF-BOT-03 | Cinco rarezas con color: común, poco común, rara, épica y legendaria | M |
| RF-BOT-04 | Recogida automática de munición y materiales; recogida manual de armas y consumibles | M |
| RF-BOT-05 | Intercambio con la ranura actual si el inventario está lleno; soltar objetos | M |
| RF-BOT-06 | Al morir, el jugador suelta todo su inventario | M |
| RF-BOT-07 | Máquinas expendedoras que cambian material por objetos (añadidas en 2018) | C |

## RF-TOR · Tormenta
| ID | Requisito | Prioridad |
|---|---|---|
| RF-TOR-01 | Círculo seguro que se revela con aviso y temporizador antes de cada cierre | M |
| RF-TOR-02 | Cada círculo nuevo está dentro del anterior | M |
| RF-TOR-03 | El daño por segundo fuera de la zona aumenta por fase e ignora el escudo | M |
| RF-TOR-04 | El muro de tormenta y su borde son visibles desde lejos | M |

## RF-UI · Interfaz
| ID | Requisito | Prioridad |
|---|---|---|
| RF-UI-01 | HUD con vida, escudo, inventario, munición, materiales, minimapa, jugadores vivos, eliminaciones y temporizador de tormenta | M |
| RF-UI-02 | Mapa completo con zona actual y siguiente, ruta del autobús y marcador personal | M |
| RF-UI-03 | Registro de eliminaciones | M |
| RF-UI-04 | Visualización de sonido para accesibilidad (añadida en 2018) | S |
| RF-UI-05 | Ajustes de sensibilidad, controles, gráficos, audio y modo daltónico | M |
| RF-UI-06 | Rueda de emoticonos y bailes | M |

## RF-SOC · Social y cuentas
| ID | Requisito | Prioridad |
|---|---|---|
| RF-SOC-01 | Cuenta de Epic con inicio de sesión en todas las plataformas | M |
| RF-SOC-02 | Lista de amigos, grupos, invitaciones y chat de voz en grupo | M |
| RF-SOC-03 | Rellenado automático de escuadra | M |
| RF-SOC-04 | Denuncia de jugadores y bloqueo | M |
| RF-SOC-05 | Juego cruzado y progresión cruzada | S |
| RF-SOC-06 | Repeticiones con cámara libre | C |

## RF-TIE · Tienda y progresión
| ID | Requisito | Prioridad |
|---|---|---|
| RF-TIE-01 | Tienda de objetos rotativa diaria y destacada, pagada con V-Bucks | M |
| RF-TIE-02 | Compra de V-Bucks mediante la tienda de cada plataforma | M |
| RF-TIE-03 | Casillero para equipar atuendos, mochilas, picos, planeadores, estelas y emoticonos | M |
| RF-TIE-04 | Pase de batalla de temporada (gratuito y de pago) con niveles, estrellas y desafíos semanales | M |
| RF-TIE-05 | Ningún objeto de pago altera el juego | M |
| RF-TIE-06 | Niveles de cuenta y de temporada | S |
