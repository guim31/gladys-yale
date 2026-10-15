// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface: English, French, German (informal "du") and Spanish (formal
// "usted"). Vocabulary of the Gladys interface (front/src/config/i18n).
// test/i18n.test.js checks that no language, key or text is missing.
// -----------------------------------------------------------------------------

/** The text of a language, English when the language is unknown. */
export const pick = (texts, language) => texts[language] ?? texts.en;

/** A multi-language object from a function of the language. */
const each = (fn) => ({ en: fn('en'), fr: fn('fr'), de: fn('de'), es: fn('es') });

// Feature names, written once when the device is added (Gladys keeps them).
export const FEATURE_NAMES = {
  en: {
    lock_state: 'Lock',
    door: 'Door',
    battery: 'Battery',
    keypad_battery_low: 'Keypad battery low',
    online: 'Online',
    last_user: 'Last user',
    last_method: 'Last method',
  },
  fr: {
    lock_state: 'Serrure',
    door: 'Porte',
    battery: 'Batterie',
    keypad_battery_low: 'Pile du clavier faible',
    online: 'En ligne',
    last_user: 'Dernier utilisateur',
    last_method: 'Dernière méthode',
  },
  de: {
    lock_state: 'Schloss',
    door: 'Tür',
    battery: 'Batterie',
    keypad_battery_low: 'Tastaturbatterie schwach',
    online: 'Online',
    last_user: 'Letzter Benutzer',
    last_method: 'Letzte Methode',
  },
  es: {
    lock_state: 'Cerradura',
    door: 'Puerta',
    battery: 'Batería',
    keypad_battery_low: 'Pila del teclado baja',
    online: 'En línea',
    last_user: 'Último usuario',
    last_method: 'Último método',
  },
};

// Name of a lock the cloud gives without a name.
export const DEVICE_NAMES = {
  en: { lock: 'Yale lock' },
  fr: { lock: 'Serrure Yale' },
  de: { lock: 'Yale-Schloss' },
  es: { lock: 'Cerradura Yale' },
};

// How a lock was operated (src/yale/model.js METHODS).
export const METHOD_NAMES = {
  en: {
    remote: 'App (remote)',
    bluetooth: 'App (Bluetooth)',
    keypad: 'Keypad',
    fingerprint: 'Fingerprint',
    manual: 'By hand',
    auto: 'Automatic',
    tag: 'Key tag or card',
    homekey: 'Home Key',
    other: 'Other',
  },
  fr: {
    remote: 'Appli (à distance)',
    bluetooth: 'Appli (Bluetooth)',
    keypad: 'Clavier',
    fingerprint: 'Empreinte',
    manual: 'À la main',
    auto: 'Automatique',
    tag: 'Badge ou carte',
    homekey: 'Home Key',
    other: 'Autre',
  },
  de: {
    remote: 'App (aus der Ferne)',
    bluetooth: 'App (Bluetooth)',
    keypad: 'Tastatur',
    fingerprint: 'Fingerabdruck',
    manual: 'Von Hand',
    auto: 'Automatisch',
    tag: 'Chip oder Karte',
    homekey: 'Home Key',
    other: 'Andere',
  },
  es: {
    remote: 'App (a distancia)',
    bluetooth: 'App (Bluetooth)',
    keypad: 'Teclado',
    fingerprint: 'Huella',
    manual: 'A mano',
    auto: 'Automático',
    tag: 'Llavero o tarjeta',
    homekey: 'Home Key',
    other: 'Otro',
  },
};

// States shown in the widget and in the messages.
export const STATE_NAMES = {
  en: {
    locked: 'Locked',
    unlocked: 'Unlocked',
    locking: 'Locking…',
    unlocking: 'Unlocking…',
    jammed: 'Jammed',
    unknown: 'Unknown',
    open: 'Open',
    closed: 'Closed',
    online: 'Online',
    offline: 'Offline',
  },
  fr: {
    locked: 'Verrouillée',
    unlocked: 'Déverrouillée',
    locking: 'Verrouillage…',
    unlocking: 'Déverrouillage…',
    jammed: 'Bloquée',
    unknown: 'Inconnu',
    open: 'Ouverte',
    closed: 'Fermée',
    online: 'En ligne',
    offline: 'Hors ligne',
  },
  de: {
    locked: 'Verriegelt',
    unlocked: 'Entriegelt',
    locking: 'Wird verriegelt…',
    unlocking: 'Wird entriegelt…',
    jammed: 'Blockiert',
    unknown: 'Unbekannt',
    open: 'Offen',
    closed: 'Geschlossen',
    online: 'Online',
    offline: 'Offline',
  },
  es: {
    locked: 'Bloqueada',
    unlocked: 'Desbloqueada',
    locking: 'Bloqueando…',
    unlocking: 'Desbloqueando…',
    jammed: 'Atascada',
    unknown: 'Desconocido',
    open: 'Abierta',
    closed: 'Cerrada',
    online: 'En línea',
    offline: 'Sin conexión',
  },
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: 'L’intégration n’a pas pu démarrer : consultez ses journaux.',
  de: 'Die Integration konnte nicht starten: Sieh in ihre Protokolle.',
  es: 'La integración no pudo arrancar: consulte sus registros.',
};

// Connection status of the Configuration screen.
export const CONNECTION_TEXT = {
  notConfigured: {
    en: 'Enter the e-mail address (or phone number) and the password of the app, then save.',
    fr: 'Saisissez l’adresse e-mail (ou le numéro de téléphone) et le mot de passe de l’appli, puis enregistrez.',
    de: 'Gib die E-Mail-Adresse (oder Telefonnummer) und das Passwort der App ein und speichere.',
    es: 'Introduzca el correo (o el número de teléfono) y la contraseña de la app y guarde.',
  },
  needsCode: {
    en: 'A verification code is needed: use “Send the code”, then “Enter the code”.',
    fr: 'Un code de vérification est nécessaire : utilisez « Envoyer le code », puis « Saisir le code ».',
    de: 'Ein Bestätigungscode ist nötig: Nutze „Code senden“ und dann „Code eingeben“.',
    es: 'Se necesita un código de verificación: use «Enviar el código» y después «Introducir el código».',
  },
  codeSent: {
    en: 'Code sent by e-mail or SMS: type it in “Enter the code”.',
    fr: 'Code envoyé par e-mail ou SMS : saisissez-le dans « Saisir le code ».',
    de: 'Code per E-Mail oder SMS gesendet: Gib ihn unter „Code eingeben“ ein.',
    es: 'Código enviado por correo o SMS: introdúzcalo en «Introducir el código».',
  },
  badCredentials: {
    en: 'The cloud refused the e-mail address, phone number or password.',
    fr: 'Le cloud a refusé l’adresse e-mail, le numéro ou le mot de passe.',
    de: 'Die Cloud hat E-Mail-Adresse, Telefonnummer oder Passwort abgelehnt.',
    es: 'La nube rechazó el correo, el número de teléfono o la contraseña.',
  },
  appKey: {
    en: 'The cloud refused the application key, not your account: see “Limits” in the documentation.',
    fr: 'Le cloud a refusé la clé de l’application, pas votre compte : voir « Limites » dans la documentation.',
    de: 'Die Cloud hat den App-Schlüssel abgelehnt, nicht dein Konto: Siehe „Grenzen“ in der Anleitung.',
    es: 'La nube rechazó la clave de la aplicación, no su cuenta: vea «Límites» en la documentación.',
  },
  auth: {
    en: 'The sign-in expired: use “Send the code”, then “Enter the code”.',
    fr: 'La connexion a expiré : utilisez « Envoyer le code », puis « Saisir le code ».',
    de: 'Die Anmeldung ist abgelaufen: Nutze „Code senden“ und dann „Code eingeben“.',
    es: 'La sesión caducó: use «Enviar el código» y después «Introducir el código».',
  },
  network: {
    en: 'The Yale cloud cannot be reached for now; new try in a few minutes.',
    fr: 'Le cloud Yale est injoignable pour l’instant ; nouvel essai dans quelques minutes.',
    de: 'Die Yale-Cloud ist gerade nicht erreichbar; neuer Versuch in ein paar Minuten.',
    es: 'La nube de Yale no responde por ahora; nuevo intento en unos minutos.',
  },
  rateLimit: {
    en: 'The Yale cloud asks to slow down; new try later.',
    fr: 'Le cloud Yale demande de ralentir ; nouvel essai plus tard.',
    de: 'Die Yale-Cloud bittet um weniger Anfragen; neuer Versuch später.',
    es: 'La nube de Yale pide ir más despacio; nuevo intento más tarde.',
  },
  noLock: {
    en: 'Signed in, but the account owns no lock (guest access is not enough).',
    fr: 'Connecté, mais le compte ne possède aucune serrure (un accès invité ne suffit pas).',
    de: 'Angemeldet, aber dem Konto gehört kein Schloss (Gastzugang reicht nicht).',
    es: 'Sesión iniciada, pero la cuenta no es propietaria de ninguna cerradura (un acceso de invitado no basta).',
  },
};

/** Connected status: "Connected: 2 locks, real time". */
export const connectedText = ({ locks, live }) =>
  each((lang) => {
    const n = locks;
    const parts = {
      en: [`Connected: ${n} lock${n > 1 ? 's' : ''}`, live ? 'real time' : 'periodic reads'],
      fr: [
        `Connecté : ${n} serrure${n > 1 ? 's' : ''}`,
        live ? 'temps réel' : 'relevés périodiques',
      ],
      de: [
        `Verbunden: ${n} ${n > 1 ? 'Schlösser' : 'Schloss'}`,
        live ? 'Echtzeit' : 'regelmäßige Abfragen',
      ],
      es: [
        `Conectado: ${n} cerradura${n > 1 ? 's' : ''}`,
        live ? 'tiempo real' : 'lecturas periódicas',
      ],
    }[lang];
    return parts.join(', ');
  });

// Answers of the actions, the widget and the scene actions.
export const MESSAGES = {
  notConfigured: CONNECTION_TEXT.notConfigured,
  codeSent: CONNECTION_TEXT.codeSent,
  noPending: {
    en: 'No code expected: use “Send the code” first.',
    fr: 'Aucun code attendu : utilisez d’abord « Envoyer le code ».',
    de: 'Kein Code erwartet: Nutze zuerst „Code senden“.',
    es: 'No se espera ningún código: use primero «Enviar el código».',
  },
  alreadySignedIn: {
    en: 'Already signed in: no code is needed.',
    fr: 'Déjà connecté : aucun code n’est nécessaire.',
    de: 'Bereits angemeldet: Kein Code nötig.',
    es: 'Sesión ya iniciada: no hace falta ningún código.',
  },
  badCode: {
    en: 'The cloud refused this code: check it, or send a new one.',
    fr: 'Le cloud a refusé ce code : vérifiez-le, ou envoyez-en un nouveau.',
    de: 'Die Cloud hat diesen Code abgelehnt: Prüfe ihn oder lass einen neuen senden.',
    es: 'La nube rechazó este código: compruébelo o pida uno nuevo.',
  },
  badCredentials: CONNECTION_TEXT.badCredentials,
  appKey: CONNECTION_TEXT.appKey,
  auth: CONNECTION_TEXT.auth,
  network: CONNECTION_TEXT.network,
  rateLimit: CONNECTION_TEXT.rateLimit,
  noLock: CONNECTION_TEXT.noLock,
  unlockOff: {
    en: 'Unlocking from Gladys is off (configuration of the integration).',
    fr: 'Le déverrouillage depuis Gladys est désactivé (configuration de l’intégration).',
    de: 'Entriegeln über Gladys ist aus (Konfiguration der Integration).',
    es: 'El desbloqueo desde Gladys está desactivado (configuración de la integración).',
  },
  unknownLock: {
    en: 'This lock is not (or no longer) in the account.',
    fr: 'Cette serrure n’est pas (ou plus) dans le compte.',
    de: 'Dieses Schloss ist nicht (mehr) im Konto.',
    es: 'Esta cerradura no está (o ya no está) en la cuenta.',
  },
  chooseLock: {
    en: 'Choose a lock.',
    fr: 'Choisissez une serrure.',
    de: 'Wähle ein Schloss.',
    es: 'Elija una cerradura.',
  },
  bridgeOffline: {
    en: 'The lock cannot be reached: its bridge (Connect, Wi-Fi) is offline.',
    fr: 'La serrure est injoignable : son pont (Connect, Wi-Fi) est hors ligne.',
    de: 'Das Schloss ist nicht erreichbar: Seine Bridge (Connect, WLAN) ist offline.',
    es: 'La cerradura no responde: su puente (Connect, Wi-Fi) está sin conexión.',
  },
  bridgeBusy: {
    en: 'The lock is busy with another operation: try again in a moment.',
    fr: 'La serrure est occupée par une autre opération : réessayez dans un instant.',
    de: 'Das Schloss ist mit einem anderen Vorgang beschäftigt: Versuche es gleich noch einmal.',
    es: 'La cerradura está ocupada con otra operación: inténtelo de nuevo en un momento.',
  },
  timeout: {
    en: 'The lock did not answer in time: check its state before trying again.',
    fr: 'La serrure n’a pas répondu à temps : vérifiez son état avant de réessayer.',
    de: 'Das Schloss hat nicht rechtzeitig geantwortet: Prüfe seinen Zustand, bevor du es erneut versuchst.',
    es: 'La cerradura no respondió a tiempo: compruebe su estado antes de volver a intentarlo.',
  },
  jammed: {
    en: 'The lock reports it is jammed: check the door and the bolt.',
    fr: 'La serrure se signale bloquée : vérifiez la porte et le pêne.',
    de: 'Das Schloss meldet sich blockiert: Prüfe Tür und Riegel.',
    es: 'La cerradura indica que está atascada: revise la puerta y el pestillo.',
  },
  failed: {
    en: 'The Yale cloud refused the operation: see the logs of the integration.',
    fr: 'Le cloud Yale a refusé l’opération : consultez les journaux de l’intégration.',
    de: 'Die Yale-Cloud hat den Vorgang abgelehnt: Sieh in die Protokolle der Integration.',
    es: 'La nube de Yale rechazó la operación: consulte los registros de la integración.',
  },
  signedOut: {
    en: 'Signed out: the token is deleted. The devices stay, without new values.',
    fr: 'Déconnecté : le jeton est supprimé. Les appareils restent, sans nouvelle valeur.',
    de: 'Abgemeldet: Das Token ist gelöscht. Die Geräte bleiben, ohne neue Werte.',
    es: 'Sesión cerrada: el token se ha borrado. Los dispositivos se mantienen, sin nuevos valores.',
  },
};

/** "Front door locked" after a command. */
export const commandDone = (operation, name) =>
  each((lang) => {
    const state = STATE_NAMES[lang][operation === 'lock' ? 'locked' : 'unlocked'].toLowerCase();
    const subject = name || DEVICE_NAMES[lang].lock;
    return `${subject}${lang === 'fr' ? ' : ' : ': '}${state}`;
  });

/** "Signed in: 2 locks (Front door, Garage)". */
export const signedInText = (names) =>
  each((lang) => {
    const n = names.length;
    const list = names.length ? ` (${names.join(', ')})` : '';
    const text = {
      en: `Signed in: ${n} lock${n > 1 ? 's' : ''}${list}`,
      fr: `Connecté : ${n} serrure${n > 1 ? 's' : ''}${list}`,
      de: `Angemeldet: ${n} ${n > 1 ? 'Schlösser' : 'Schloss'}${list}`,
      es: `Sesión iniciada: ${n} cerradura${n > 1 ? 's' : ''}${list}`,
    }[lang];
    return text.length > 200 ? `${text.slice(0, 199)}…` : text;
  });

/** The messages of an error kind (src/yale/client.js ERROR_KINDS). */
export const KIND_MESSAGES = {
  network: MESSAGES.network,
  app_key: MESSAGES.appKey,
  bad_credentials: MESSAGES.badCredentials,
  bad_code: MESSAGES.badCode,
  auth: MESSAGES.auth,
  rate_limit: MESSAGES.rateLimit,
  bridge_offline: MESSAGES.bridgeOffline,
  bridge_busy: MESSAGES.bridgeBusy,
  timeout: MESSAGES.timeout,
  server: MESSAGES.network,
  unexpected: MESSAGES.failed,
};
