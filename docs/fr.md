# WattWächter Plus

Une intégration [Gladys Assistant](https://gladysassistant.com/) qui lit votre compteur électrique à
travers un **WattWächter Plus**. Tout reste sur votre réseau local : pas de cloud, pas de compte.

## Prérequis : activer Modbus

**Wattwächter der Fa. Wattwächter, angebracht an den Zähler bei ihnen:[wattwächter] (https://www.wattwaechter.com/)/)** 

**Le serveur Modbus est désactivé par défaut dans le WattWächter et doit d'abord être activé.** Sans
cette étape, l'appareil ne répond pas sur le port 502 et l'intégration ne peut rien lire.

Ouvrez l'interface web du WattWächter, utilisez l'**explorateur d'API**, choisissez l'endpoint
`POST /api/v1/settings` et envoyez ce contenu :

```json
{ "modbus": { "enable": true, "port": 502 } }
```

Ne changez le port que s'il est déjà occupé. Le port choisi se saisit ensuite dans la configuration de
l'intégration.

## Installation

1. Dans Gladys, ouvrez **Intégrations** et installez le **WattWächter Plus**.
2. Ouvrez son écran **Configuration**.
3. Saisissez l'adresse de l'appareil : son IP, par exemple `192.168.0.6`, ou le nom mDNS
   `wattwaechter-xxxxxxxxxxxx.local`.
4. Saisissez le port Modbus, 502 par défaut.
5. Saisissez le **jeton de lecture de l'API REST** pour les totaux de période du widget. Sans jeton,
   tout fonctionne sauf les quatre boutons de période.
6. Appuyez sur **Tester la connexion**. La réponse indique le modèle, le firmware, le nombre de mesures
   et la puissance actuelle.
7. Lancez une recherche dans l'onglet **Découverte** et créez l'appareil trouvé.

## Ce que l'appareil fournit

Tout est en lecture seule : un compteur mesure, il ne connaît aucune commande.

| Fonction | Signification |
| --- | --- |
| Puissance | La consommation actuelle en watts. **Positif = consommation, négatif = injection.** |
| Index consommation | L'index cumulé en kWh, pour la surveillance d'énergie. |
| Index injection | L'index cumulé de l'injection en kWh. |
| Puissance L1 à L3 | La puissance par phase. |
| Tension L1 à L3 | La tension par phase, en volts. |
| Courant L1 à L3 | Le courant par phase, en ampères. |
| Fréquence | La fréquence du réseau, en hertz. |

Une mesure que le compteur ne fournit pas ne crée aucune fonction. Un compteur qui ne connaît que deux
phases n'a donc pas de L3, plutôt qu'un zéro qui serait faux.

## Le widget « Compteur électrique »

- **La puissance** en grande tuile, avec le signe du compteur. En injection, la tuile devient verte.
- **Le numéro de compteur**, pour savoir de quel compteur il s'agit.
- **Quatre boutons :** aujourd'hui, 7 jours, 30 jours, 365 jours. La période choisie est mise en
  évidence et sa consommation s'affiche en dessous, en kWh.

Dans les réglages de la tuile, vous pouvez aussi choisir quel compteur l'alimente et si les totaux
apparaissent en kWh ou en Wh.

## Scènes

**Le déclencheur « La puissance franchit une limite »** se déclenche quand la puissance dépasse la
limite haute ou descend sous la limite basse. Les limites se règlent dans la configuration ; 0
désactive le côté concerné. La limite basse peut être négative, car l'injection est une puissance
négative.

Le déclencheur se déclenche **une fois par franchissement**, pas à chaque mesure. Il faut que la
puissance s'éloigne à nouveau de la limite avant un nouveau déclenchement. Pour une simple condition
« puissance au-dessus de X », le déclencheur « l'état d'un appareil change » de Gladys suffit.

**L'action « Lire les index du compteur »** lit l'appareil maintenant et transmet puissance,
consommation, injection et numéro de compteur aux étapes suivantes.

**L'action « Lire le total d'une période »** additionne la consommation sur une période et la renvoie.
Nécessite le jeton de lecture.

## Comment ça marche

Deux chemins vers le même appareil, et les deux sont nécessaires :

- **Modbus TCP** fournit les mesures. Il ne répond qu'aux codes de lecture `0x03` et `0x04`, et il ne
  connaît que le présent. L'appareil accepte au maximum deux clients à la fois.
- **L'API REST** fournit les périodes, car elle seule sait ce qui a été consommé hier. Elle nécessite
  le jeton de lecture et fonctionne sur le port 80.

L'intégration lit les registres selon le standard **SunSpec**. À partir du firmware 1.2.1, les valeurs
sont aussi disponibles en flottants, et ce chemin est utilisé quand il répond ; sinon les entiers sont
mis à l'échelle dans l'intégration. La valeur que SunSpec réserve pour « ce compteur ne fournit pas
cette mesure » est filtrée et jamais publiée.

## Mention légale

Ce projet est **indépendant et non officiel**. Il **n'est ni affilié à Smart Circuits GmbH** ni à
WattWächter, et n'est ni autorisé, ni soutenu, ni sponsorisé par eux. **WattWächter** est une marque de
son propriétaire respectif et n'est utilisée ici que pour nommer l'appareil avec lequel cette
intégration fonctionne. Toutes les autres marques, noms de produits et de sociétés appartiennent à
leurs propriétaires respectifs.
