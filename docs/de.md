# WattWächter Plus

Eine [Gladys Assistant](https://gladysassistant.com/)-Integration, die den Stromzähler über einen
**WattWächter Plus** liest. Alles läuft im lokalen Netz, ohne Cloud und ohne Konto.

## Voraussetzung: Modbus einschalten

**Der Modbus-Server ist im WattWächter standardmäßig ausgeschaltet und muss zuerst aktiviert werden.**
Ohne diesen Schritt antwortet das Gerät auf Port 502 nicht, und die Integration kann nichts lesen.

In der Weboberfläche des WattWächters den **API-Explorer** öffnen, den Endpunkt `POST /api/v1/settings`
wählen und diesen Inhalt senden:

```json
{ "modbus": { "enable": true, "port": 502 } }
```

Den Port nur ändern, wenn er belegt ist. Der eingestellte Port wird später in der Konfiguration der
Integration eingetragen.

## Installation

1. In Gladys **Integrationen** öffnen und den **WattWächter Plus** installieren.
2. Die **Konfiguration** öffnen.
3. Die Adresse des Geräts eintragen: die IP, zum Beispiel `192.168.0.6`, oder der mDNS-Name
   `wattwaechter-xxxxxxxxxxxx.local`.
4. Den Modbus-Port eintragen, standardmäßig 502.
5. Für die Zeitraumwerte im Widget das **Lesetoken der REST-API** eintragen. Ohne Token funktioniert
   alles außer den vier Zeitraumknöpfen.
6. **Verbindung testen** drücken. Die Antwort nennt Modell, Firmware, die Anzahl der Messwerte und die
   aktuelle Leistung.
7. Im Reiter **Entdecken** einen Scan starten und das gefundene Gerät hinzufügen.

## Was das Gerät liefert

Alles ist schreibgeschützt: Ein Zähler misst, er kennt keine Befehle.

| Funktion | Bedeutung |
| --- | --- |
| Leistung | Der aktuelle Verbrauch in Watt. **Positiv ist Bezug, negativ ist Einspeisung.** |
| Zählerstand Bezug | Der fortlaufende Zählerstand in kWh, für die Energieüberwachung. |
| Zählerstand Einspeisung | Der fortlaufende Zählerstand der Einspeisung in kWh. |
| Leistung L1 bis L3 | Die Leistung je Phase. |
| Spannung L1 bis L3 | Die Spannung je Phase in Volt. |
| Strom L1 bis L3 | Der Strom je Phase in Ampere. |
| Frequenz | Die Netzfrequenz in Hertz. |

Einen Wert, den der Zähler nicht liefert, legt die Integration gar nicht erst an. Bei einem Zähler,
der nur zwei Phasen kennt, fehlt L3 also, statt eine Null anzuzeigen.

## Das Widget „Stromzähler“

- **Die Leistung** als große Kachel, mit dem Vorzeichen des Zählers. Bei Einspeisung färbt sich die
  Kachel grün.
- **Die Zählernummer**, damit klar ist, welcher Zähler gemeint ist.
- **Vier Knöpfe:** Heute, 7 Tage, 30 Tage, 365 Tage. Der gedrückte Zeitraum wird hervorgehoben, und
  darunter erscheint der Verbrauch dieses Zeitraums in kWh.

In den Einstellungen der Kachel lässt sich zusätzlich wählen, welcher Zähler die Kachel versorgt und
ob die Zeitraumwerte in kWh oder Wh erscheinen.

## Szenen

**Auslöser „Leistung überschreitet eine Grenze“** meldet, wenn die Leistung die obere Grenze
überschreitet oder unter die untere fällt. Die Grenzen stehen in der Konfiguration; 0 schaltet die
jeweilige Seite ab. Die untere Grenze darf negativ sein, denn Einspeisung ist negative Leistung.

Der Auslöser meldet **einmal pro Überschreitung**, nicht bei jeder Messung. Erst wenn die Leistung
wieder etwas Abstand zur Grenze gewonnen hat, kann er erneut auslösen. Für eine einfache Bedingung
„Leistung über X“ genügt der Gladys-Auslöser „Zustand eines Geräts ändert sich“ auf der
Leistungsfunktion.

**Aktion „Zählerstände lesen“** liest das Gerät jetzt und übergibt Leistung, Bezug, Einspeisung und
Zählernummer an die folgenden Schritte.

**Aktion „Verbrauch eines Zeitraums lesen“** summiert den Verbrauch über einen Zeitraum und übergibt
ihn. Braucht das Lesetoken.

## Wie es funktioniert

Zwei Wege zum selben Gerät, und beide werden gebraucht:

- **Modbus TCP** liefert die Messwerte. Er antwortet nur auf die Lesebefehle `0x03` und `0x04`, und er
  kennt nur den aktuellen Moment. Das Gerät erlaubt höchstens zwei gleichzeitige Verbindungen.
- **Die REST-API** liefert die Zeiträume, weil nur sie weiß, wie viel gestern verbraucht wurde. Sie
  braucht das Lesetoken und läuft über Port 80.

Die Integration liest die Register nach dem **SunSpec**-Standard. Ab Firmware 1.2.1 stehen die Werte
zusätzlich als Fließkommazahlen bereit; dann nutzt die Integration diesen Weg, sonst rechnet sie die
Ganzzahlen mit ihren Skalierungsfaktoren um. Der Wert, den SunSpec für „diesen Wert liefert der
Zähler nicht“ reserviert, wird gefiltert und nie veröffentlicht.

## Rechtliches

Dies ist ein **unabhängiges, inoffizielles Projekt**. Es steht in **keiner Verbindung zu Smart
Circuits GmbH** oder zu WattWächter und wird von diesen weder autorisiert noch unterstützt oder
gesponsert. **WattWächter** ist eine Marke des jeweiligen Inhabers und wird hier nur verwendet, um das
Gerät zu benennen, mit dem diese Integration arbeitet. Alle übrigen Marken, Produkt- und Firmennamen
gehören ihren jeweiligen Inhabern.
