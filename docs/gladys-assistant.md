# Gladys Assistant – externe WattWächter-Integration

Die **WattWächter-Integration für Gladys Assistant** bindet den WattWächter Plus in die Hausautomation Gladys Assistant ein. Sie stellt aktuelle Messwerte des Stromzählers in Gladys Assistant bereit und ermöglicht, Verbrauchswerte im Dashboard anzuzeigen und in Szenen zu verwenden.

Die Kommunikation erfolgt direkt im lokalen Netzwerk. Für aktuelle Messwerte ist keine Cloud-Verbindung erforderlich.

![Integration](..//cover.png)

## Funktionen im Überblick

- **Aktuelle Messwerte:** Leistung, Zählerstand für Strombezug und Einspeisung sowie – sofern vom Zähler bereitgestellt – Werte der einzelnen Phasen.
- **Dashboard-Widget „Stromzähler“:** zeigt die aktuelle Leistung, die Zählernummer und auswählbare Verbrauchszeiträume.
- **Verbrauchszeiträume:** Werte für heute, 7 Tage, 30 Tage und 365 Tage.
- **Szenen-Auslöser:** reagiert, wenn die Leistung eine konfigurierte obere oder untere Grenze überschreitet.
- **Szenen-Aktionen:** aktuelle Zählerwerte lesen oder den Verbrauch eines Zeitraums ermitteln.
- **Verbindungstest:** prüft die Erreichbarkeit und zeigt Informationen zu Firmware und verfügbaren Messwerten.

Die Integration ist schreibgeschützt: Sie liest Messwerte aus und sendet keine Steuerbefehle an den Stromzähler.

## Voraussetzungen

- Ein eingerichteter **WattWächter Plus**, verbunden mit dem lokalen Netzwerk.
- **Gladys Assistant 5.1.0 oder neuer**.
- Gladys und WattWächter Plus müssen sich in einem Netzwerk befinden, in dem das Gerät erreichbar ist.
- Der **Modbus-TCP-Server** des WattWächters muss aktiviert sein.
- Für Verbrauchswerte über Zeiträume wird das Lesetoken der REST-API benötigt.

## Modbus am WattWächter Plus aktivieren

Der Modbus-Server ist standardmäßig ausgeschaltet. Er muss aktiviert werden, bevor Gladys die aktuellen Messwerte lesen kann.

1. Die Weboberfläche des WattWächter Plus öffnen.
2. Den **API-Explorer** aufrufen.
3. Den Endpunkt `POST /api/v1/settings` auswählen.
4. Folgenden Inhalt senden:

```json
{
  "modbus": {
    "enable": true,
    "port": 502
  }
}
```

Der Port `502` ist der Standardport. Falls am Gerät ein anderer Port konfiguriert ist, muss dieser auch in Gladys eingetragen werden.

## Installation und Einrichtung

1. In Gladys den Bereich **Integrationen** öffnen und **WattWächter Plus** installieren.
2. Die Konfiguration der Integration öffnen.
3. Als Adresse die IP-Adresse des WattWächters oder seinen mDNS-Namen eintragen, beispielsweise `192.168.0.6` oder `wattwaechter-xxxxxxxxxxxx.local`.
4. Den Modbus-Port eintragen (standardmäßig `502`).
5. Für die Verbrauchswerte über Zeiträume das **Lesetoken der REST-API** eintragen.
6. **Verbindung testen** auswählen. Die Rückmeldung enthält unter anderem Modell, Firmware und verfügbare Messwerte.
7. In Gladys den Bereich **Entdecken** öffnen, einen Scan starten und das gefundene Gerät hinzufügen.

Ohne Lesetoken können die aktuellen Messwerte weiterhin gelesen werden. Lediglich Funktionen, die Verbrauchswerte über Zeiträume aus der REST-API abrufen, stehen dann nicht zur Verfügung.

<!-- BILD-PLATZHALTER: Hier einen Screenshot der Konfiguration oder des Verbindungstests einfügen. -->

## Verfügbare Messwerte

Welche Werte verfügbar sind, hängt vom angeschlossenen Stromzähler ab. Messwerte, die der Zähler nicht bereitstellt, werden nicht als künstliche Nullwerte angelegt.

| Messwert | Beschreibung |
| --- | --- |
| Aktuelle Leistung | Momentane Leistung in Watt. Positive Werte bedeuten Strombezug, negative Werte Einspeisung. |
| Zählerstand Bezug | Fortlaufender Strombezugs-Zählerstand in kWh. |
| Zählerstand Einspeisung | Fortlaufender Einspeise-Zählerstand in kWh. |
| Leistung L1 bis L3 | Aktuelle Leistung je Phase, sofern verfügbar. |
| Spannung L1 bis L3 | Spannung je Phase in Volt, sofern verfügbar. |
| Strom L1 bis L3 | Strom je Phase in Ampere, sofern verfügbar. |
| Frequenz | Netzfrequenz in Hertz, sofern verfügbar. |

## Das Dashboard-Widget „Stromzähler“

Das Widget stellt zentrale Informationen übersichtlich auf dem Gladys-Dashboard dar:

- **Aktuelle Leistung:** als große Kachel. Bei Einspeisung wird der negative Leistungswert angezeigt und die Kachel grün hervorgehoben.
- **Zählernummer:** zur Zuordnung des angezeigten Zählers.
- **Verbrauchszeiträume:** Schaltflächen für Heute, 7 Tage, 30 Tage und 365 Tage.

Die Zeitraum-Schaltflächen lassen sich in den Widget-Einstellungen einzeln ein- oder ausblenden. Der ausgewählte Zeitraum wird hervorgehoben; der zugehörige Verbrauch wird in kWh angezeigt. In den Einstellungen können außerdem der verwendete Zähler und die Anzeigeeinheit für Zeitraumwerte ausgewählt werden.

<!-- BILD-PLATZHALTER: Hier einen Screenshot des Gladys-Dashboard-Widgets einfügen. -->

## Szenen verwenden

### Auslöser: Leistung überschreitet eine Grenze

Der Auslöser kann auf eine obere und eine untere Leistungsgrenze konfiguriert werden. Er reagiert, wenn die Leistung eine der aktiven Grenzen überschreitet. Eine Grenze mit dem Wert `0` ist deaktiviert. Da Einspeisung als negative Leistung erscheint, kann die untere Grenze ebenfalls negativ sein.

Der Auslöser meldet eine Überschreitung einmal pro Ereignis und löst nicht bei jeder Messung erneut aus, solange der Wert an der Grenze bleibt. Eine Hysterese verhindert wiederholtes Auslösen bei kleinen Schwankungen um den Grenzwert.

### Aktion: Zählerstände lesen

Diese Aktion liest die aktuellen Werte aus und stellt unter anderem Leistung, Bezugs-Zählerstand, Einspeise-Zählerstand und Zählernummer für nachfolgende Szenenschritte bereit.

### Aktion: Verbrauch eines Zeitraums lesen

Diese Aktion ermittelt den Verbrauch für einen gewählten Zeitraum. Dafür ist das Lesetoken der REST-API erforderlich.

## Technischer Hintergrund

Die Integration nutzt zwei lokale Schnittstellen des WattWächter Plus:

- **Modbus TCP** liefert aktuelle Messwerte über den konfigurierten Modbus-Port (standardmäßig `502`). Die Integration verwendet ausschließlich lesende Modbus-Funktionen.
- **REST-API** liefert Verbrauchswerte für Zeiträume. Sie wird für die entsprechenden Widget- und Szenenfunktionen verwendet und benötigt das Lesetoken.

Die Messwerte werden anhand der SunSpec-Register des Geräts gelesen. Bei unterstützter Firmware bevorzugt die Integration die bereitgestellten Fließkommawerte; andernfalls kann sie skalierte Ganzzahlwerte verwenden.

## Fehlerbehebung

### Gladys findet den WattWächter nicht

- Prüfen, ob der WattWächter Plus eingeschaltet und mit dem Netzwerk verbunden ist.
- Prüfen, ob die IP-Adresse beziehungsweise der mDNS-Name korrekt ist.
- Sicherstellen, dass Modbus TCP in der Weboberfläche aktiviert ist.
- Prüfen, ob der konfigurierte Modbus-Port mit dem am Gerät eingestellten Port übereinstimmt.
- Netzwerkregeln oder VLAN-Einstellungen kontrollieren, die den Zugriff zwischen Gladys und WattWächter verhindern könnten.

### Aktuelle Messwerte werden angezeigt, aber Zeitraumwerte fehlen

Prüfen, ob das Lesetoken der REST-API korrekt hinterlegt ist. Aktuelle Messwerte über Modbus und Verbrauchswerte über Zeiträume verwenden unterschiedliche Schnittstellen.

### Einzelne Messwerte fehlen

Nicht jeder Stromzähler stellt alle Phasen- oder Zusatzwerte bereit. Die Integration legt nur Messwerte an, die vom Gerät tatsächlich geliefert werden.

## Hinweise

Die WattWächter-Integration ist eine externe Community Integration für Gladys Assistant. Die aktuelle Version und Installationshinweise finden sich im Projekt-Repository:

[WattWächter Plus für Gladys Assistant auf GitHub](https://github.com/tomgermany/gladys-wattwaechter)

