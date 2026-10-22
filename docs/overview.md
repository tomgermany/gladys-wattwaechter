# WattWächter Plus — was was bedeutet und wie es läuft

Diese Datei ist die Übersicht: was die Integration tut, welche Bausteine es gibt, was jeder Wert
bedeutet und in welcher Reihenfolge etwas passiert. Sie ersetzt nicht die Anwenderdokumentation
(`docs/de.md`), sondern erklärt den Aufbau dahinter.

## Auf einen Blick

| Baustein | Was er tut |
| --- | --- |
| Gerät „WattWächter“ | Zeigt die Messwerte und die zwei Zählerstände. Alles schreibgeschützt. |
| Widget „Stromzähler“ | Leistung groß, Zählernummer, vier Zeitraumknöpfe. |
| Auslöser „Leistung überschreitet eine Grenze“ | Meldet das Überschreiten einer einstellbaren Leistungsgrenze. |
| Aktion „Zählerstände lesen“ | Liest das Gerät und gibt die Werte an die Szene weiter. |
| Aktion „Verbrauch eines Zeitraums lesen“ | Summiert einen Zeitraum über die REST-API. |
| Knopf „Verbindung testen“ | Sagt, was das Gerät geantwortet hat. |

## Die Dateien im Projekt

| Datei | Aufgabe |
| --- | --- |
| `index.js` | Die Verdrahtung: alles verbinden, nichts rechnen. |
| `src/config.js` | Vorgaben und Prüfung der Einstellungen. |
| `src/wattwaechter/transport.js` | Die rohe TCP-Verbindung. |
| `src/wattwaechter/modbus.js` | Das Modbus-Protokoll und die Registertabelle. |
| `src/wattwaechter/api.js` | Die REST-API für die Zeiträume. |
| `src/devices/meter.js` | Aus Messwerten werden Gladys-Funktionen. |
| `src/widgets.js` | Der Inhalt der Dashboard-Kachel. |
| `src/scenes.js` | Die beiden Szenen-Aktionen. |
| `src/wattwaechter/labels.js` | Die Texte, die aus dem Code kommen. |
| `gladys-assistant-integration.json` | Das Manifest: Name, Felder, Widget, Szenen. |

## Die Werte und ihre Bedeutung

| Wert | Einheit | Bedeutung |
| --- | --- | --- |
| Leistung | W | Aktueller Verbrauch. **Positiv = Bezug, negativ = Einspeisung.** |
| Leistung L1–L3 | W | Dasselbe je Phase. |
| Spannung L1–L3 | V | Spannung je Phase, normal etwa 230 V. |
| Strom L1–L3 | A | Strom je Phase. |
| Frequenz | Hz | Netzfrequenz, normal etwa 50 Hz. |
| Zählerstand Bezug | kWh | Fortlaufender Zählerstand, für die Energieüberwachung. |
| Zählerstand Einspeisung | kWh | Fortlaufender Zählerstand der Einspeisung. |

Ein negativer Wert bei der Leistung ist kein Fehler: Er bedeutet, dass gerade Strom ins Netz geht,
also eingespeist wird.

## Wie ein Ablauf aussieht

```
Start des Containers
  |
  +-- Konfiguration lesen (Adresse, Port, Token, Grenzen)
  |
  +-- Modbus verbinden
  |     +-- Model 1 lesen        -> Hersteller, Modell, Seriennummer, Firmware
  |     +-- Model 213 probieren  -> Fließkommazahlen vorhanden?
  |     +-- Model 203 oder 213 lesen -> alle Messwerte in einem Objekt
  |
  +-- Gerät veröffentlichen     -> erscheint im Reiter Entdecken
  |
  +-- jede Minute (oder seltener, je nach Einstellung)
        +-- Messwerte neu lesen
        +-- Werte an Gladys senden
        +-- Leistungsgrenzen prüfen -> Auslöser, falls überschritten
```

Der Zeitraumwert im Widget läuft anders, weil Modbus keine Vergangenheit kennt:

```
Knopf im Widget gedrückt
  |
  +-- Zeitraum merken (Tag, Woche, Monat, Jahr)
  |
  +-- REST-API fragen (/history/highRes oder /history/lowRes)
  |
  +-- Verbrauch als Zahl in die Kachel, Knopf hervorgehoben
```

## Zwei Wege zum selben Gerät

| | Modbus TCP | REST-API |
| --- | --- | --- |
| Wofür | Live-Werte | Zeiträume |
| Port | 502 | 80 |
| Zugangsdaten | keine | Lesetoken |
| Kann schreiben | nein | nein, wird nicht genutzt |
| Ohne Internet | ja | ja, alles lokal |

## Wo man nachsieht, wenn etwas nicht geht

1. **Im Protokoll der Integration.** Dort steht, was gelesen wurde und was nicht. Meine Meldungen
   nennen immer die betroffene Stelle.
2. **Der Knopf „Verbindung testen“** in der Konfiguration. Er sagt in Worten, was das Gerät geantwortet
   hat.
3. **Der Reiter Entdecken.** Wenn dort nichts erscheint, steht im Protokoll, ob der Scan überhaupt
   angekommen ist.

Häufige Ursachen, in dieser Reihenfolge:

- Der Modbus-Server im WattWächter ist nicht eingeschaltet. Das ist der häufigste Fall.
- Die Adresse stimmt nicht, oder der Container erreicht das Gerät nicht.
- Der Port wurde im Gerät geändert, in der Konfiguration aber nicht.
- Für die Zeitraumknöpfe fehlt das Lesetoken.
