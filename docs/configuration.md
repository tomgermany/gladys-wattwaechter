# Die Konfigurationsseite

Jedes Feld der Konfiguration, was dort hineingehört und was passiert, wenn es
falsch ist. Die Reihenfolge folgt der Seite in Gladys.

## Hinweis: Verbindung zum WattWächter

Ein reines Hinweisfeld, hier ist nichts einzutragen. Es nennt den Schritt, ohne
den nichts funktioniert:

**Der Modbus-Server im Gerät ist standardmäßig ausgeschaltet und muss zuerst
eingeschaltet werden.** Weboberfläche öffnen, API-Explorer, den Endpunkt
`POST /api/v1/settings` wählen und senden:

```json
{ "modbus": { "enable": true, "port": 502 } }
```

Wer das überspringt, sieht später nur `WattWächter unreachable` und sucht an der
falschen Stelle.

## Adresse des WattWächters

**Pflichtfeld.** Die IP-Adresse, zum Beispiel `192.168.0.6`, oder der mDNS-Name
`wattwaechter-xxxxxxxxxxxx.local`. Der Name ist bequemer, weil er sich bei einer
geänderten IP von selbst anpasst, dafür klappt er nicht in jedem Netz.

Ist das Feld leer, meldet die Integration in der Konfiguration: „Bitte die
Adresse des WattWächters in der Konfiguration eintragen.“

## Modbus-Port

Vorgabe 502. Nur ändern, wenn der Port im Gerät geändert wurde. Steht dort ein
anderer Port als im Gerät, kommt gar keine Verbindung zustande.

## Lesetoken der REST-API

Nur nötig, wenn das Gerät eine Anmeldung verlangt. Die Einstellung heißt dort
`api_auth_required`.

- **`api_auth_required: false`** — das ist der Auslieferungszustand. Das Feld
  bleibt **leer**, und die Zeitraumknöpfe funktionieren trotzdem.
- **`api_auth_required: true`** — dann wird ein Token gebraucht. Er wird im Gerät
  erzeugt, über die zwei Endpunkte `POST /api/v1/auth/tokens/generate` und
  `POST /api/v1/auth/tokens/confirm`, erreichbar im API-Explorer. Der Token zum
  **Lesen** genügt; der Schreibzugang wird bewusst nicht verlangt.

Das Feld ist als geheimes Feld angelegt: Der Wert erscheint maskiert und liegt
nicht im Klartext in einer geteilten Dashboard-Ansicht.

Die Integration schickt den Anmelde-Kopf nur mit, wenn wirklich ein Token
eingetragen ist.

## Abfrageintervall in Sekunden

Wie oft die Messwerte gelesen werden, mindestens 60. Ein Stromzähler braucht
keine Sekundenabfrage, und Gladys fragt ohnehin höchstens einmal pro Minute ab.
Ein Wert von 60 bedeutet also: bei jeder Abfrage lesen. Ein Wert von 300
bedeutet: nur bei jeder fünften.

## Leistungsgrenze oben in Watt

Vorgabe 3500. Der Auslöser meldet, wenn die Leistung darüber steigt. **0 schaltet
diese Seite ab.**

Die Grenze hängt am Hausanschluss: Wer mit Durchlauferhitzer oder Wallbox
arbeitet, braucht einen höheren Wert als ein Haushalt ohne.

## Leistungsgrenze unten in Watt

Vorgabe 0, also abgeschaltet. Der Auslöser meldet, wenn die Leistung darunter
fällt, also bei starker Einspeisung.

Negative Werte sind erlaubt und sinnvoll: Einspeisung ist negative Leistung.
Wer melden will, wenn mehr als 2000 W ins Netz gehen, trägt hier −2000 ein.

## Der Knopf „Verbindung testen“

Er liest das Gerät jetzt und antwortet in Worten:

```
Antwort: WattWaechter, Firmware 1.2.1. 12 Messwerte, Leistung 2410 W.
```

Schlägt er fehl, nennt er den Grund und fragt nach dem Modbus-Server im Gerät.
Details zur Fehlersuche stehen in `docs/troubleshooting.md`.

## Was die Konfiguration meldet

Unter den Feldern steht der Verbindungszustand:

- **Verbunden** — das Gerät wurde erkannt und antwortet.
- **Getrennt** mit einer Begründung — zum Beispiel die fehlende Adresse oder ein
  nicht erreichbares Gerät. Die Meldung nennt jeweils den Grund.

## Zwei Wege, zwei Zuständigkeiten

| Einstellung | Wirkt auf |
| --- | --- |
| Adresse, Modbus-Port | Die Live-Werte über Modbus |
| Lesetoken | Die Zeitraumwerte über die REST-API |
| Abfrageintervall | Wie oft gelesen wird |
| Leistungsgrenzen | Den Szenen-Auslöser |

Die Trennung ist Absicht: Wer nur die Live-Werte will, braucht sich um das Token
nicht zu kümmern, und wer den Modbus-Server ausgeschaltet lässt, kann immer noch
nichts lesen — in beiden Fällen sagt die Integration, was fehlt.
