# WattWächter Plus

Una integración de [Gladys Assistant](https://gladysassistant.com/) que lee tu contador eléctrico a
través de un **WattWächter Plus**. Todo se queda en tu red local: sin nube y sin cuenta.

## Requisito: activar Modbus

**El servidor Modbus viene desactivado de fábrica en el WattWächter y hay que activarlo primero.** Sin
eso, el aparato no responde en el puerto 502 y la integración no puede leer nada.

Abre la interfaz web del WattWächter, usa el **explorador de API**, elige el endpoint
`POST /api/v1/settings` y envía este contenido:

```json
{ "modbus": { "enable": true, "port": 502 } }
```

Cambia el puerto solo si ya está ocupado. El puerto elegido se introduce después en la configuración
de la integración.

## Instalación

1. En Gladys, abre **Integraciones** e instala el **WattWächter Plus**.
2. Abre su pantalla **Configuración**.
3. Introduce la dirección del aparato: su IP, por ejemplo `192.168.0.6`, o el nombre mDNS
   `wattwaechter-xxxxxxxxxxxx.local`.
4. Introduce el puerto Modbus, 502 por defecto.
5. Introduce el **token de lectura de la API REST** para los totales de periodo del widget. Sin token
   todo funciona salvo los cuatro botones de periodo.
6. Pulsa **Probar la conexión**. La respuesta indica el modelo, el firmware, el número de medidas y la
   potencia actual.
7. Lanza una búsqueda en la pestaña **Descubrir** y crea el aparato que encuentre.

## Qué ofrece el aparato

Todo es de solo lectura: un contador mide, no conoce órdenes.

| Función | Significado |
| --- | --- |
| Potencia | El consumo actual en vatios. **Positivo es consumo, negativo es vertido.** |
| Lectura de consumo | La lectura acumulada en kWh, para la supervisión de energía. |
| Lectura de vertido | La lectura acumulada del vertido en kWh. |
| Potencia L1 a L3 | La potencia por fase. |
| Tensión L1 a L3 | La tensión por fase, en voltios. |
| Corriente L1 a L3 | La corriente por fase, en amperios. |
| Frecuencia | La frecuencia de red, en hercios. |

Una medida que el contador no ofrece no crea ninguna función. Un contador que solo conoce dos fases no
tiene L3, en lugar de un cero que sería falso.

## El widget «Contador eléctrico»

- **La potencia** en una tarjeta grande, con el signo del contador. Con vertido la tarjeta se vuelve
  verde.
- **El número de contador**, para saber de qué contador se trata.
- **Cuatro botones:** hoy, 7 días, 30 días, 365 días. El periodo elegido se resalta y su consumo
  aparece debajo, en kWh.

En los ajustes de la tarjeta puedes elegir además qué contador la alimenta y si los totales aparecen
en kWh o en Wh.

## Escenas

**El disparador «La potencia cruza un límite»** se activa cuando la potencia supera el límite superior
o baja del inferior. Los límites se configuran en la configuración; 0 desactiva ese lado. El límite
inferior puede ser negativo, porque el vertido es potencia negativa.

El disparador se activa **una vez por cruce**, no en cada medida. La potencia tiene que alejarse otra
vez del límite antes de activarse de nuevo. Para una simple condición «potencia por encima de X» basta
con el disparador «el estado de un dispositivo cambia» de Gladys.

**La acción «Leer las lecturas del contador»** lee el aparato ahora y entrega potencia, consumo,
vertido y número de contador a los pasos siguientes.

**La acción «Leer el total de un periodo»** suma el consumo de un periodo y lo devuelve. Necesita el
token de lectura.

## Cómo funciona

Dos caminos hacia el mismo aparato, y los dos hacen falta:

- **Modbus TCP** aporta las medidas. Solo responde a los códigos de lectura `0x03` y `0x04`, y solo
  conoce el presente. El aparato admite como máximo dos clientes a la vez.
- **La API REST** aporta los periodos, porque solo ella sabe cuánto se consumió ayer. Necesita el
  token de lectura y funciona en el puerto 80.

La integración lee los registros según el estándar **SunSpec**. Desde el firmware 1.2.1 los valores
también están disponibles como flotantes, y se usa ese camino cuando responde; si no, los enteros se
escalan en la integración. El valor que SunSpec reserva para «este contador no ofrece esa medida» se
filtra y nunca se publica.

## Aviso legal

Este es un proyecto **independiente y no oficial**. **No está afiliado a Smart Circuits GmbH** ni a
WattWächter, y no está autorizado, respaldado ni patrocinado por ellos. **WattWächter** es una marca
de su respectivo propietario y se usa aquí únicamente para nombrar el aparato con el que funciona
esta integración. Todas las demás marcas, nombres de productos y de empresas pertenecen a sus
respectivos propietarios.
