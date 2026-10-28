# Fehlersuche

Was zu tun ist, wenn etwas nicht läuft — in der Reihenfolge, in der man suchen sollte.

## 1. Erst der Testknopf, dann das Protokoll

In der Konfiguration gibt es den Knopf **Verbindung testen**. Er liest das Gerät jetzt und antwortet in
Worten: Modell, Firmware, Anzahl der gefundenen Messwerte und die aktuelle Leistung. Diese Antwort ist
der erste Anlaufpunkt, nicht das Protokoll.

Schlägt er fehl, nennt er den Grund. Und in der Antwort steht der Hinweis, der bei diesem Gerät am
häufigsten zutrifft: der ausgeschaltete Modbus-Server.

## 2. Der häufigste Fall: Modbus ist aus

**Der Modbus-Server ist im WattWächter standardmäßig ausgeschaltet.** Ohne ihn antwortet das Gerät auf
Port 502 nicht, und keine Abfrage kommt durch.

Einschalten: Weboberfläche öffnen, **API-Explorer**, den Endpunkt `POST /api/v1/settings` wählen und
senden:

```json
{ "modbus": { "enable": true, "port": 502 } }
```

Der Erfolg lässt sich prüfen: Ein `GET` auf `/api/v1/modbus/status` liefert `enabled`, `running` und
den Port.

## 3. Der Selbsttest der Adressierung

Diese Prüfung stammt aus der Dokumentation des Herstellers und ist der schnellste Weg herauszufinden,
ob die Registeradressen stimmen.

**Lies zwei Register ab Protokolladresse 40000.** Kommen die Werte **21365** und **28243** zurück —
hex `0x5375` und `0x6E53`, als Text **„SunS“** — dann stimmt die Adressierung.

Warum das wichtig ist: Der WattWächter zählt seine Register so, wie er sie druckt. Es gibt keinen
Versatz abzuziehen. Wer versuchsweise eins oder gar 40000 abzieht, bekommt für jeden dokumentierten
Pfad die Antwort **„ungültige Datenadresse“** (Modbus-Ausnahme 2) — so, als gäbe es das Register nicht.

Die Integration führt diesen Test selbst aus, bevor sie die Messwerte liest. Steht im Protokoll also
`Not a SunSpec map`, stimmt die erwartete SunSpec-Kennung an Adresse 40000 nicht. Prüfe zuerst die Registeradresse und den Adressversatz; zusätzlich müssen Gerät, Port und das verwendete Registermodell stimmen.

## 4. Die Fehlermeldungen lesen

| Meldung im Protokoll | Bedeutung | Was zu tun ist |
| --- | --- | --- |
| `Modbus exception 2 … (asked for X, on the wire Y)` | Das Gerät kennt das Register nicht. | `X` und `Y` vergleichen. Beide müssen gleich sein. Weichen sie ab, ist der Adressversatz im Client falsch. |
| `No answer within … ms` | Die Verbindung steht, es kommt aber nichts zurück. | Der Socket ist in einem unklaren Zustand, oder ein zweiter Client blockiert. Das Gerät erlaubt nur zwei gleichzeitige Verbindungen. |
| `WattWächter unreachable` | Es kam gar keine Verbindung zustande. | Adresse, Port und Netz prüfen. Der Container muss das Gerät erreichen. |
| `Not a SunSpec map: 40000 answered …` | Die Adresse 40000 liefert nicht „SunS“. | Registeradresse und Adressversatz prüfen; außerdem Gerät, Port und Registermodell kontrollieren. |
| `Tolerated (…)` | Ein einzelner Wert wurde übersprungen. | Kein Fehler: Der Zähler liefert diesen Wert nicht. Der Wert fehlt dann im Gerät, statt eine Null anzuzeigen. |

## 5. Werte erscheinen um Faktor 10 oder 100 verschoben

Die Register von Model 203 tragen ihre Skalierung nicht im Wert, sondern in einem eigenen Register.
Und die Faktoren sind **je Gruppe verschieden**:

| Wert | Skalierungsregister | Faktor | Ergibt |
| --- | --- | --- | --- |
| Strom | 40076 | −2 | 0,01 A |
| Spannung | 40085 | −1 | 0,1 V |
| Leistung | 40092 | W_SF | Watt |
| Frequenz | 40087 | Hz_SF | Hertz |

Wer für die Spannung den Faktor des Stroms nimmt, bekommt die Spannung zehnmal so groß. Genau das ist
die klassische Verwechslung bei diesem Gerät.

### Zählerstände für Bezug und Einspeisung

Die kumulierten Energiezähler verwenden eigene Register. Laut Herstellerdokumentation gelten:

| Zählerstand | Model 203 | Skalierungsregister | Model 213 |
| --- | --- | --- | --- |
| Netzbezug (OBIS 1.8.0) | `40116–40117` | `40124` (`TotWh_SF`) | `40245–40246` (Float32) |
| Netzeinspeisung (OBIS 2.8.0) | `40108–40109` | `40124` (`TotWh_SF`) | `40237–40238` (Float32) |

Diese Registerangaben stammen aus der [Modbus-Dokumentation des Herstellers](https://docs.wattwaechter.com/plus/interfaces/modbus/#model-213-three-phase-meter-wye-float). Die Korrektur der Einspeisung muss noch mit einem realen Gerät geprüft werden; die Dokumentation allein ist kein Hardwaretest.

Ab Firmware **1.2.1** gibt es Model 213 mit den genannten Energiezählerwerten als Fließkommazahlen, ohne
Skalierungsfaktor. Die Integration nutzt diesen Weg, wenn das Gerät ihn beantwortet. Das Protokoll
sagt beim Start, welcher Weg genommen wurde.

## 6. Ein Wert fehlt im Gerät

Das ist kein Fehler. Der WattWächter beantwortet nur die Werte, die Ihr Stromzähler tatsächlich
liefert. Register ohne Daten tragen den Sentinel `0x8000`, also −32768. Die Integration filtert ihn
heraus und legt die Funktion gar nicht an — besser als eine Null, die falsch wäre.

Welche Werte Ihr Zähler liefert, zeigt das Dashboard der Weboberfläche und der Status-Endpunkt unter
`/api/v1/modbus/status`. Dort hat jeder Eintrag ein Feld `valid`.

## 7. Die Zeitraumknöpfe fehlen

Die vier Knöpfe für Tag, Woche, Monat und Jahr kommen über die REST-API, nicht über Modbus. Sie
fehlen, wenn die Integration diese Schnittstelle nicht erreichen kann.

Bei den meisten Geräten ist das kein Problem: Die Einstellung `api_auth_required` steht auf `false`,
und die API antwortet ohne Anmeldung. Verlangt Ihr Gerät eine Anmeldung, tragen Sie das Lesetoken in
der Konfiguration ein.

## 8. Zwei Modbus-Clients sind einer zu viel

Der WattWächter erlaubt **höchstens zwei gleichzeitige Modbus-Verbindungen**. Läuft die Integration
und daneben noch Home Assistant, evcc oder ein zweites Gladys mit derselben Integration, kann die
dritte Anfrage abgewiesen werden. Der Status-Endpunkt zeigt mit `active_connections`, wie viele
gerade offen sind.

## 9. Der Weg zur Quelle

Diese Integration stützt sich auf zwei Dokumente des Herstellers. Wer tiefer einsteigen will:

- Die Modbus-Register: <https://docs.wattwaechter.com/plus/interfaces/modbus/>
- Die REST-API, für die Zeitraumswerte: <https://docs.wattwaechter.com/plus/interfaces/api-reference/>
