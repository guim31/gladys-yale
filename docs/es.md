# Yale Home

Siga y bloquee sus cerraduras inteligentes **Yale** y **August** desde Gladys, a través de la nube
Yale Home (o la nube August / Yale Access en Estados Unidos): estado del pestillo, puerta
(DoorSense), batería, quién accionó la cerradura y cómo, en tiempo real cuando la nube lo permite.

**Desarrollada sin el hardware: se agradecen sus comentarios.** La integración se escribió a partir
del comportamiento publicado de la nube (biblioteca yalexs, integración de Home Assistant) y se
probó con respuestas grabadas, nunca con una cerradura real. Indique lo que funciona y lo que no en
[github.com/guim31/gladys-yale/issues](https://github.com/guim31/gladys-yale/issues).

Esta integración no está afiliada a Yale, August ni ASSA ABLOY. Yale, August, Linus y DoorSense son
marcas de sus propietarios.

## Presentación

- Un dispositivo Gladys por cerradura de la cuenta: **Cerradura** (bloqueada, desbloqueada, en
  movimiento, atascada), **Puerta** (abierta o cerrada, con DoorSense), **Batería**, **Pila del
  teclado baja** (con teclado), **En línea** (la nube alcanza la cerradura), **Último usuario** y
  **Último método**.
- Bloqueo desde el widget, una escena o la configuración. El desbloqueo está **desactivado por
  defecto** y nunca es posible por voz ni como un interruptor.
- Tres disparadores de escena: **Cerradura Yale desbloqueada** (por quién y cómo), **Puerta dejada
  abierta**, **Batería Yale baja**.

Cerraduras previstas: todas las de la aplicación Yale Home / August, Yale Linus, Linus L2, Assure
Lock 2, Yale Conexis L2, August Smart Lock (3.ª y 4.ª generación, Wi-Fi), con su puente (Connect,
Wi-Fi integrado) para ser accesibles a distancia.

## Requisitos

- Gladys 5.1.0 o posterior.
- Una cerradura ya instalada en la aplicación Yale Home (o August / Yale Access), con su
  **puente**: Yale Connect Bridge, August Connect o Wi-Fi integrado. Sin puente, la nube no alcanza
  la cerradura: no hay bloqueo a distancia, y los estados solo cambian cuando un teléfono se
  sincroniza por Bluetooth.
- El correo (o el número de teléfono) y la contraseña de una cuenta **propietaria** de la cerradura
  («superuser» en la aplicación). Un acceso de invitado no basta.
- Acceso a ese buzón o a ese teléfono para el código de verificación, una vez.

## Configuración

### Inicio de sesión

1. En Gladys, **Integraciones → Instalar desde GitHub**, y abra la configuración de Yale Home.
2. Elija la **Aplicación** que usa: **Yale Home** (Europa y resto del mundo), **Yale Access
   (Estados Unidos)** o **August (Estados Unidos)**.
3. En **Iniciar sesión con**, elija correo electrónico o número de teléfono; rellene **Correo o
   número de teléfono** (un número empieza por + y el prefijo del país, por ejemplo +34612345678) y
   **Contraseña**, y guarde.
4. La primera vez, el estado pide un código. Al final de la página, pulse **Enviar el código**: llega
   un código por correo o SMS.
5. Introdúzcalo en **Introducir el código** y ejecute la acción. El estado muestra entonces
   «Conectado» y el número de cerraduras; las cerraduras aparecen en la pestaña Descubrimiento,
   añádalas a Gladys.

El código valida esta instalación de la integración: un reinicio, un token nuevo o uno caducado no
piden un código nuevo. **Cerrar sesión** olvida el token y la instalación; entonces hace falta un
código nuevo.

### Ajustes

| Ajuste                            | Por defecto | Uso                                                                                                   |
| --------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| Aplicación                        | Yale Home   | La nube de su aplicación.                                                                             |
| Iniciar sesión con                | Correo      | Correo o número de teléfono, como en la aplicación.                                                   |
| Correo o número de teléfono       | —           | El identificador de la cuenta.                                                                        |
| Contraseña                        | —           | Gladys no la vuelve a mostrar; la integración solo guarda el token en `/data`.                        |
| Clave de aplicación (avanzado)    | vacía       | Déjela vacía. Solo si tiene otra clave emitida por Yale (vea Límites).                                |
| Permitir desbloquear desde Gladys | desactivado | Desactivado: solo bloquear. Activado: el widget (tras confirmación) y las escenas pueden desbloquear. |
| Lectura de las cerraduras         | 5 minutos   | Ritmo de las lecturas sin eventos en tiempo real; si no, cada 30 minutos.                             |
| Idioma de los nombres y textos    | Français    | Nombres de las funciones (conservados al añadir), último método, textos de disparadores.              |

## Dispositivos

Cada cerradura de la cuenta se convierte en un dispositivo con el nombre de la aplicación, modelo
«Yale Home» (o August) seguido del modelo de la cerradura. Todas las funciones son de solo lectura:
nada puede abrir la puerta como un interruptor, ni un comando de voz ni una escena «apagar todo».

### Funciones

| Función               | Tipo en Gladys       | Valores                                                  |
| --------------------- | -------------------- | -------------------------------------------------------- |
| Cerradura             | estado de cerradura  | 0 desbloqueada, 1 bloqueada, 2 en movimiento, 3 atascada |
| Puerta                | sensor de apertura   | 0 abierta, 1 cerrada (solo DoorSense)                    |
| Batería               | batería, %           | nivel de las pilas de la cerradura                       |
| Pila del teclado baja | batería baja (sí/no) | 1 cuando el teclado indica pilas bajas (con teclado)     |
| En línea              | entrada              | 1 cuando la nube alcanza la cerradura por su puente      |
| Último usuario        | texto                | nombre de la última persona que bloqueó o desbloqueó     |
| Último método         | texto                | cómo (vea abajo)                                         |

Los métodos: **App (a distancia)**, **App (Bluetooth)**, **Teclado**, **Huella**, **A mano** (pomo
interior o llave), **Automático** (bloqueo automático), **Llavero o tarjeta**, **Home Key**,
**Otro**. Proceden del historial de la aplicación; una cerradura que no lo indica muestra **Otro**.

## Widget

El widget **Cerradura Yale** muestra una cerradura: su nombre, la batería (en directo), el estado del
pestillo, la puerta, el último usuario y método, la conexión con la nube. Su botón **Bloquear**
bloquea; el botón **Desbloquear** solo aparece si el desbloqueo desde Gladys está permitido, en
rojo, y pide una confirmación. El estado actual se marca con un icono de verificación. Elija la
cerradura en los ajustes del widget (vacío: la única cerradura de la cuenta).

## Disparadores de escena

- **Cerradura Yale desbloqueada**: se desbloqueó una cerradura. Filtros: la cerradura, cómo
  (teclado, huella, app…), el usuario escrito exactamente como en la aplicación. Variables:
  `lock_name`, `user`, `method` (clave: `keypad`, `fingerprint`, `remote`, `bluetooth`, `manual`,
  `auto`, `tag`, `homekey`, `other`) y `method_label` (en el idioma de la configuración).
- **Puerta dejada abierta**: la puerta de una cerradura con DoorSense ha permanecido abierta 1, 2,
  5, 10, 15, 30 minutos o 1 hora (una elección por escena; un evento en cada escalón mientras la
  puerta siga abierta). Variables: `lock_name`, `minutes`.
- **Batería Yale baja**: las pilas de la cerradura bajaron del 20 % (o la cerradura avisa), o las del
  teclado están bajas. Una vez por bajada, incluso tras un reinicio. Variables: `lock_name`, `part`
  (`lock` o `keypad`), `level` (%).

Un evento «desbloqueada» procede del historial: con tiempo real, unos segundos después de la
operación; sin él, en la lectura siguiente. Una actividad vista con más de 10 minutos de retraso no
dispara nada.

## Acciones de escena

- **Bloquear una cerradura Yale**: bloquea la cerradura elegida; salida `state` (`locked` o
  `jammed`).
- **Desbloquear una cerradura Yale**: la desbloquea, solo si **Permitir desbloquear desde Gladys**
  está activado; si no, la acción falla.

## Acciones de la configuración

- **Enviar el código**: pide a la nube un código de verificación.
- **Introducir el código**: valida esta instalación con el código recibido.
- **Bloquear una cerradura**: bloquea ahora la cerradura elegida.
- **Probar la conexión**: lee las cerraduras de la cuenta, sin accionarlas.
- **Cerrar sesión**: borra el token y esta instalación (hará falta un código nuevo).

## Tiempo real y cuotas

La integración se suscribe, como la aplicación, al canal en tiempo real (PubNub) de cada cerradura:
una operación o la puerta llegan en segundos, y después el historial dice quién y cómo. Cuando este
canal no está disponible, las cerraduras se leen al ritmo de **Lectura de las cerraduras**.

Una lectura es una petición para la lista de cerraduras, una por cerradura (estado, puerta, pilas,
puente) y una por vivienda (las 10 últimas actividades). Con dos cerraduras en una vivienda y sin
tiempo real, son 4 peticiones cada 5 minutos; con tiempo real, cada 30 minutos. Yale no publica
ninguna cuota para esta API no oficial; cuando responde «demasiadas peticiones», la integración hace
una pausa de 10 minutos, y después de hasta 2 horas. Nunca despierta una cerradura para leerla (eso
gasta las pilas): el estado mostrado es el último que conoce la nube, como en la aplicación.

## Ejemplos de escenas

- **Bienvenida**: disparador **Cerradura Yale desbloqueada**, cómo = Teclado o Huella → encender la
  luz de la entrada y enviar «{{triggerEvent.data.user}} ha llegado».
- **Puerta olvidada**: disparador **Puerta dejada abierta**, 10 minutos → notificación «La puerta
  {{triggerEvent.data.lock_name}} lleva 10 minutos abierta».
- **Bloqueo nocturno**: cada día a las 23:00, si el estado de la cerradura no es 1 → **Bloquear una
  cerradura Yale**.
- **Pilas**: disparador **Batería Yale baja** → un recordatorio para comprar pilas.

## Solución de problemas

- **«La nube rechazó la clave de la aplicación, no su cuenta»**: vea Límites más abajo.
- **«La nube rechazó el correo, el número de teléfono o la contraseña»**: compruébelos en la
  aplicación y guarde de nuevo la configuración. La integración deja de intentarlo hasta el próximo
  cambio de configuración, para que la cuenta no se bloquee.
- **El código es rechazado**: es válido unos minutos; ejecute de nuevo **Enviar el código** e
  introduzca el más reciente.
- **«La cerradura no responde: su puente está sin conexión»**: compruebe el puente Connect o el
  Wi-Fi de la cerradura en la aplicación.
- **Ninguna cerradura encontrada**: la cuenta debe ser propietaria de la cerradura; un acceso de
  invitado no basta.
- **Nada en tiempo real**: el estado indica «lecturas periódicas»; los estados siguen igualmente, al
  ritmo de las lecturas.
- Más detalles: variable de entorno `LOG_LEVEL=debug` en el contenedor. Los registros nunca
  contienen la contraseña, el token, el correo ni la clave de aplicación.

## Límites

- **Clave de aplicación.** La nube solo acepta las peticiones de una aplicación que reconoce por su
  clave. La integración usa las claves públicas de las aplicaciones, las que publicó la biblioteca
  yalexs. Yale indicó en enero de 2025 que Yale Home ya solo acepta claves de socios, y yalexs
  constata lo mismo para August: desde entonces, Home Assistant inicia sesión mediante una
  vinculación de cuenta oficial reservada a él. Si la nube rechaza la clave, el estado lo dice
  claramente; su cuenta no tiene la culpa, y la integración no puede funcionar mientras Yale no
  vuelva a aceptar una clave. Si tiene una clave emitida por Yale, introdúzcala en **Clave de
  aplicación (avanzado)**.
- API no oficial, la de las aplicaciones: puede cambiar sin previo aviso.
- Ni timbre, ni cámara, ni alarma (alarmas Yale Home): solo cerraduras. Sin «apertura» (unlatch) de
  la Linus L2: desbloquear basta para abrir la puerta.
- Una cerradura solo Bluetooth (sin puente) aparece sin conexión y no se acciona a distancia.
- Desarrollada sin el hardware ni una cuenta: el vocabulario exacto de algunas cerraduras recientes
  puede variar.

## Créditos

Construida sobre lo que la biblioteca [yalexs](https://github.com/bdraco/yalexs) (MIT, de Joe Lu,
J. Nick Koston y colaboradores) y la [integración Yale de Home
Assistant](https://www.home-assistant.io/integrations/yale) (Apache 2.0) enseñaron sobre la nube;
sus respuestas grabadas son las fixtures de las pruebas.
