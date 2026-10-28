1-) . Einspeisung: Das ist eigentlich der wichtigste Punkt. Die Einspeisung wird weiterhin aus den falschen Registern gelesen (40118 / 40126 bzw. 40251). Richtig sind bei Modell 203 die Register 40108–40109 mit Skalierung 40124 und bei Modell 213 die Register 40237–40238. Sonst zeigt die Integration bei der Einspeisung falsche Werte. Die Tabelle findest du hier:
https://docs.wattwaechter.com/plus/interfaces/modbus/#model-213-three-phase-meter-wye-float

      Zu 1:) Im Branch aufgenommen, Abschlusstest stehen noch aus

2.) Titelbild: Das Badge ist bisher nur im README. Kannst du es noch auf das Titelbild (cover.png) setzen? Das ist ja das Bild, das in Gladys angezeigt wird.

      Zu 2:) Neues cover.png liegt local bereits vor, github in Vorbereitung, Veröffentlichung in Gladys Assistant Katalog dann automatisiert, sobald test-register gemerged wurde.

3.) Firmenname: In der englischen und französischen Doku steht noch "Smart Circuits" mit Leerzeichen.

      Zu 3:) Erledigt in diesem Branch, Merge nach Abschluss obiger 1
