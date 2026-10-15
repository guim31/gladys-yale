# Yale Home

Verfolge und verriegle deine **Yale**- und **August**-Smart-Locks aus Gladys, über die Yale-Home-Cloud
(oder die August- / Yale-Access-Cloud in den USA): Riegelzustand, Tür (DoorSense), Batterie, wer das
Schloss wie bedient hat, in Echtzeit, wenn die Cloud es erlaubt.

**Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Die Integration wurde nach dem
veröffentlichten Verhalten der Cloud geschrieben (Bibliothek yalexs, Home-Assistant-Integration) und
mit aufgezeichneten Antworten getestet, nie mit einem echten Schloss. Melde, was funktioniert und
was nicht, auf [github.com/guim31/gladys-yale/issues](https://github.com/guim31/gladys-yale/issues).

Diese Integration ist nicht mit Yale, August oder ASSA ABLOY verbunden. Yale, August, Linus und
DoorSense sind Marken ihrer Inhaber.

## Überblick

- Ein Gladys-Gerät pro Schloss des Kontos: **Schloss** (verriegelt, entriegelt, in Bewegung,
  blockiert), **Tür** (offen oder geschlossen, mit DoorSense), **Batterie**, **Tastaturbatterie
  schwach** (mit Tastatur), **Online** (die Cloud erreicht das Schloss), **Letzter Benutzer** und
  **Letzte Methode**.
- Verriegeln über das Widget, eine Szene oder die Konfiguration. Entriegeln ist **standardmäßig
  aus** und nie per Sprache oder wie ein Schalter möglich.
- Drei Szenenauslöser: **Yale-Schloss entriegelt** (von wem und wie), **Tür offen gelassen**,
  **Yale-Batterie schwach**.

Unterstützte Schlösser: alle Schlösser der App Yale Home / August, Yale Linus, Linus L2, Assure Lock
2, Yale Conexis L2, August Smart Lock (3. und 4. Generation, WLAN), mit ihrer Bridge (Connect,
eingebautes WLAN), um aus der Ferne erreichbar zu sein.

## Voraussetzungen

- Gladys 5.1.0 oder neuer.
- Ein Schloss, das schon in der App Yale Home (oder August / Yale Access) eingerichtet ist, mit
  seiner **Bridge**: Yale Connect Bridge, August Connect oder eingebautes WLAN. Ohne Bridge erreicht
  die Cloud das Schloss nicht: kein Verriegeln aus der Ferne, und die Zustände ändern sich nur, wenn
  sich ein Telefon per Bluetooth synchronisiert.
- E-Mail-Adresse (oder Telefonnummer) und Passwort eines Kontos, dem das Schloss **gehört**
  („superuser“ in der App). Ein Gastzugang reicht nicht.
- Einmal Zugriff auf dieses E-Mail-Postfach oder Telefon für den Bestätigungscode.

## Konfiguration

### Anmeldung

1. In Gladys **Integrationen → Von GitHub installieren**, dann die Konfiguration von Yale Home
   öffnen.
2. Wähle die **App**, die du nutzt: **Yale Home** (Europa und der Rest der Welt), **Yale Access
   (USA)** oder **August (USA)**.
3. Wähle unter **Anmelden mit** E-Mail-Adresse oder Telefonnummer; fülle **E-Mail-Adresse oder
   Telefonnummer** (eine Telefonnummer beginnt mit + und der Landesvorwahl, z. B. +4915112345678)
   und **Passwort** aus und speichere.
4. Beim ersten Mal verlangt der Status einen Code. Klicke unten auf der Seite auf **Code senden**:
   Ein Code kommt per E-Mail oder SMS.
5. Gib ihn unter **Code eingeben** ein und starte die Aktion. Der Status zeigt dann „Verbunden“ und
   die Zahl der Schlösser; die Schlösser erscheinen im Reiter Entdecken, füge sie zu Gladys hinzu.

Der Code bestätigt diese Installation der Integration: Ein Neustart, ein neues oder abgelaufenes
Token brauchen keinen neuen Code. **Abmelden** vergisst Token und Installation; dann ist ein neuer
Code nötig.

### Einstellungen

| Einstellung                       | Standard  | Zweck                                                                                         |
| --------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| App                               | Yale Home | Die Cloud deiner App.                                                                         |
| Anmelden mit                      | E-Mail    | E-Mail-Adresse oder Telefonnummer, wie in der App.                                            |
| E-Mail-Adresse oder Telefonnummer | —         | Die Kennung des Kontos.                                                                       |
| Passwort                          | —         | Von Gladys nie wieder angezeigt; die Integration behält nur das Token in `/data`.             |
| App-Schlüssel (erweitert)         | leer      | Leer lassen. Nur wenn du einen anderen, von Yale ausgegebenen Schlüssel hast (siehe Grenzen). |
| Entriegeln über Gladys erlauben   | aus       | Aus: nur verriegeln. An: Das Widget (nach Bestätigung) und die Szenen können entriegeln.      |
| Abfrage der Schlösser             | 5 Minuten | Takt der Abfragen ohne Echtzeit-Ereignisse; sonst alle 30 Minuten.                            |
| Sprache der Namen und Texte       | Français  | Namen der Funktionen (nach dem Hinzufügen behalten), letzte Methode, Auslösertexte.           |

## Geräte

Jedes Schloss des Kontos wird ein Gerät mit dem Namen aus der App, Modell „Yale Home“ (oder
August) gefolgt vom Modell des Schlosses. Alle Funktionen sind schreibgeschützt: Nichts kann die
Tür wie ein Schalter öffnen, auch kein Sprachbefehl und keine „alles ausschalten“-Szene.

### Funktionen

| Funktion                 | Typ in Gladys              | Werte                                                         |
| ------------------------ | -------------------------- | ------------------------------------------------------------- |
| Schloss                  | Schlosszustand             | 0 entriegelt, 1 verriegelt, 2 in Bewegung, 3 blockiert        |
| Tür                      | Öffnungssensor             | 0 offen, 1 geschlossen (nur DoorSense)                        |
| Batterie                 | Batterie, %                | Batteriestand des Schlosses                                   |
| Tastaturbatterie schwach | Batterie schwach (ja/nein) | 1, wenn die Tastatur schwache Batterien meldet (mit Tastatur) |
| Online                   | Eingang                    | 1, wenn die Cloud das Schloss über seine Bridge erreicht      |
| Letzter Benutzer         | Text                       | Name der letzten Person, die verriegelt oder entriegelt hat   |
| Letzte Methode           | Text                       | wie (siehe unten)                                             |

Die Methoden: **App (aus der Ferne)**, **App (Bluetooth)**, **Tastatur**, **Fingerabdruck**, **Von
Hand** (Innenknauf oder Schlüssel), **Automatisch** (Auto-Lock), **Chip oder Karte**, **Home Key**,
**Andere**. Die Angaben kommen aus dem Verlauf der App; ein Schloss, das es nicht angibt, zeigt **Andere**.

## Widget

Das Widget **Yale-Schloss** zeigt ein Schloss: Name, Batterie (live), Riegelzustand, Tür, letzter
Benutzer und Methode, Verbindung zur Cloud. Seine Taste **Verriegeln** verriegelt; die Taste
**Entriegeln** erscheint nur, wenn Entriegeln über Gladys erlaubt ist, in Rot, und fragt nach einer
Bestätigung. Der aktuelle Zustand ist mit einem Häkchen-Symbol markiert. Wähle das Schloss in den
Widget-Einstellungen (leer: das einzige Schloss des Kontos).

## Szenenauslöser

- **Yale-Schloss entriegelt**: Ein Schloss wurde entriegelt. Filter: das Schloss, wie (Tastatur,
  Fingerabdruck, App…), der Benutzer genau wie in der App geschrieben. Variablen: `lock_name`,
  `user`, `method` (Schlüssel: `keypad`, `fingerprint`, `remote`, `bluetooth`, `manual`, `auto`,
  `tag`, `homekey`, `other`) und `method_label` (in der Sprache der Konfiguration).
- **Tür offen gelassen**: Die Tür eines Schlosses mit DoorSense ist 1, 2, 5, 10, 15, 30 Minuten
  oder 1 Stunde offen geblieben (eine Wahl pro Szene; ein Ereignis pro Stufe, solange die Tür offen
  bleibt). Variablen: `lock_name`, `minutes`.
- **Yale-Batterie schwach**: Die Batterien des Schlosses sind unter 20 % gefallen (oder das Schloss
  warnt), oder die der Tastatur sind schwach. Einmal pro Abfall, auch über Neustarts hinweg.
  Variablen: `lock_name`, `part` (`lock` oder `keypad`), `level` (%).

Ein „entriegelt“-Ereignis kommt aus dem Verlauf: mit Echtzeit wenige Sekunden nach dem Vorgang, ohne
sie bei der nächsten Abfrage. Eine Aktivität, die mehr als 10 Minuten zu spät gesehen wird, löst
nichts aus.

## Szenenaktionen

- **Yale-Schloss verriegeln**: verriegelt das gewählte Schloss; Ausgabe `state` (`locked` oder
  `jammed`).
- **Yale-Schloss entriegeln**: entriegelt es, nur wenn **Entriegeln über Gladys erlauben** an ist;
  sonst schlägt die Aktion fehl.

## Aktionen der Konfiguration

- **Code senden**: fordert bei der Cloud einen Bestätigungscode an.
- **Code eingeben**: bestätigt diese Installation mit dem erhaltenen Code.
- **Ein Schloss verriegeln**: verriegelt jetzt das gewählte Schloss.
- **Verbindung testen**: liest die Schlösser des Kontos, ohne sie zu bedienen.
- **Abmelden**: löscht das Token und diese Installation (ein neuer Code wird nötig).

## Echtzeit und Kontingente

Die Integration abonniert wie die App den Echtzeitkanal (PubNub) jedes Schlosses: Ein Vorgang oder
die Tür kommen in Sekunden an, danach sagt der Verlauf, wer und wie. Ist dieser Kanal nicht
verfügbar, werden die Schlösser im Takt von **Abfrage der Schlösser** gelesen.

Eine Abfrage ist eine Anfrage für die Liste der Schlösser, eine pro Schloss (Zustand, Tür,
Batterien, Bridge) und eine pro Zuhause (die letzten 10 Aktivitäten). Mit zwei Schlössern in einem
Zuhause und ohne Echtzeit sind das 4 Anfragen alle 5 Minuten; mit Echtzeit alle 30 Minuten. Yale
veröffentlicht kein Kontingent für diese inoffizielle API; antwortet sie „zu viele Anfragen“,
pausiert die Integration 10 Minuten, dann bis zu 2 Stunden. Die Integration weckt nie ein Schloss, um es zu
lesen (das leert die Batterien): Der angezeigte Zustand ist der letzte, den die Cloud kennt, wie in
der App.

## Szenenbeispiele

- **Willkommen**: Auslöser **Yale-Schloss entriegelt**, wie = Tastatur oder Fingerabdruck → Flurlicht
  an und „{{triggerEvent.data.user}} ist zu Hause“ senden.
- **Vergessene Tür**: Auslöser **Tür offen gelassen**, 10 Minuten → Benachrichtigung „Die Tür
  {{triggerEvent.data.lock_name}} ist seit 10 Minuten offen“.
- **Nachts verriegeln**: jeden Tag um 23 Uhr, wenn der Schlosszustand nicht 1 ist →
  **Yale-Schloss verriegeln**.
- **Batterien**: Auslöser **Yale-Batterie schwach** → eine Erinnerung, Batterien zu kaufen.

## Fehlerbehebung

- **„Die Cloud hat den App-Schlüssel abgelehnt, nicht dein Konto“**: siehe Grenzen unten.
- **„Die Cloud hat E-Mail-Adresse, Telefonnummer oder Passwort abgelehnt“**: Prüfe sie in der App
  und speichere die Konfiguration erneut. Die Integration versucht es bis zur nächsten Änderung der
  Konfiguration nicht mehr, damit das Konto nicht gesperrt wird.
- **Der Code wird abgelehnt**: Er gilt wenige Minuten; starte **Code senden** erneut und gib den
  neuesten ein.
- **„Das Schloss ist nicht erreichbar: Seine Bridge ist offline“**: Prüfe die Connect-Bridge oder
  das WLAN des Schlosses in der App.
- **Kein Schloss gefunden**: Das Schloss muss dem Konto gehören; ein Gastzugang reicht nicht.
- **Nichts in Echtzeit**: Der Status zeigt „regelmäßige Abfragen“; die Zustände folgen trotzdem, im
  Abfragetakt.
- Mehr Details: Umgebungsvariable `LOG_LEVEL=debug` am Container. Die Protokolle enthalten nie das
  Passwort, das Token, die E-Mail-Adresse oder den App-Schlüssel.

## Grenzen

- **App-Schlüssel.** Die Cloud nimmt nur Anfragen einer App an, die sie an ihrem Schlüssel erkennt.
  Die Integration nutzt die öffentlichen Schlüssel der Apps, die die Bibliothek yalexs
  veröffentlicht hat. Yale hat im Januar 2025 mitgeteilt, dass Yale Home nur noch
  Partnerschlüssel annimmt, und yalexs stellt dasselbe für August fest: Seitdem meldet sich Home
  Assistant über eine offizielle, ihm vorbehaltene Kontoverknüpfung an. Lehnt die Cloud den
  Schlüssel ab, sagt es der Status deutlich; dein Konto ist nicht schuld, und die Integration kann
  nicht funktionieren, solange Yale keinen Schlüssel mehr annimmt. Hast du einen von Yale
  ausgegebenen Schlüssel, gib ihn unter **App-Schlüssel (erweitert)** ein.
- Inoffizielle API, die der Apps: Diese kann sich ohne Vorankündigung ändern.
- Keine Türklingel, keine Kamera, keine Alarmanlage (Yale-Home-Alarme): nur Schlösser. Kein
  „Öffnen“ (Unlatch) des Linus L2: Entriegeln reicht, um die Tür zu öffnen.
- Ein reines Bluetooth-Schloss (ohne Bridge) erscheint offline und lässt sich nicht aus der Ferne
  bedienen.
- Ohne die Hardware und ohne Konto entwickelt: Das genaue Vokabular mancher neuer Schlösser kann
  abweichen.

## Danksagung

Aufgebaut auf dem, was die Bibliothek [yalexs](https://github.com/bdraco/yalexs) (MIT, von Joe Lu,
J. Nick Koston und Mitwirkenden) und die [Yale-Integration von Home
Assistant](https://www.home-assistant.io/integrations/yale) (Apache 2.0) über die Cloud gezeigt
haben; ihre aufgezeichneten Antworten sind die Test-Fixtures.
