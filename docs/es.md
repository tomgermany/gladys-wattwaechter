# WattWächter Plus

Una integración para [Gladys Assistant](https://gladysassistant.com/) que lee el medidor de electricidad a través de un
**WattWächter Plus**. Todo funciona en la red local, sin nube y sin necesidad de crear una cuenta.

## Requisito previo: Habilitar Modbus

**El servidor Modbus en el WattWächter viene desactivado por defecto y debe habilitarse primero.**
Si no se realiza este paso, el dispositivo no responderá en el puerto 502 y la integración no podrá realizar ninguna lectura.

En la interfaz web del WattWächter, abra el **API-Explorer**, seleccione el endpoint `POST /api/v1/settings`
y envíe el siguiente contenido:

```json
{ "modbus": { "enable": true, "port": 502 } }
```

Cambie el puerto únicamente si este ya está ocupado. El puerto configurado deberá indicarse más adelante en la configuración de la integración.

## Instalación

1. En Gladys, acceda a **Integraciones** e instale **WattWächter Plus**.
2. Abra la **configuración**.
3. Introduzca la dirección del dispositivo: la dirección IP (por ejemplo, `192.168.0.6`) o el nombre mDNS
`wattwaechter-xxxxxxxxxxxx.local`.
4. Introduzca el puerto Modbus (por defecto, 502).
5. Para obtener los valores por periodos de tiempo en el widget, introduzca el **token de lectura de la API REST**. Sin este token,
todo funcionará correctamente, a excepción de los cuatro botones de selección de periodo.
6. Pulse **Probar conexión**. La respuesta indicará el modelo, la versión del firmware, el número de valores medidos y la
potencia actual.
7. En la pestaña **Descubrir**, inicie un escaneo y añada el dispositivo detectado.

## Datos proporcionados por el dispositivo

Todo es de solo lectura: un medidor realiza mediciones, pero no admite comandos.

| Función | Significado |
| --- | --- |
| Potencia | Consumo actual en vatios. **Los valores positivos indican consumo de la red; los negativos, inyección a la red.** |
| Lectura de consumo | La lectura acumulada del contador en kWh, para el seguimiento de la energía. |
| Lectura de inyección | La lectura acumulada de la energía inyectada a la red en kWh. |
| Potencia L1 a L3 | La potencia en cada fase. |
| Tensión L1 a L3 | La tensión en cada fase, en voltios. |
| Intensidad L1 a L3 | La intensidad de corriente en cada fase, en amperios. |
| Frecuencia | La frecuencia de la red, en hercios. |

Si el contador no proporciona un valor, la integración simplemente no crea el dato correspondiente. Por ejemplo, en un contador que solo registra dos fases, el dato L3 no aparecerá (en lugar de mostrar un cero).

## El widget «Contador de electricidad»

- **La potencia:** se muestra en un recuadro grande, incluyendo el signo del contador. Si hay inyección a la red, el recuadro cambia a color verde.
- **El número de serie del contador:** para identificar claramente a qué dispositivo se refiere.
- **Cuatro botones:** «Hoy», «7 días», «30 días» y «365 días». Se pueden ocultar desde la configuración del widget. El periodo seleccionado aparece resaltado y,
debajo, se muestra el consumo correspondiente a dicho periodo en kWh.

En la configuración del widget, también es posible seleccionar qué contador proporciona los datos y
definir si los valores por periodo se muestran en kWh o en Wh.

## Escenas

**Disparador «La potencia supera un límite»:** notifica cuando la potencia supera el límite superior o cae por debajo del límite inferior. Estos límites se definen en la configuración; establecer el valor en 0 desactiva el límite correspondiente. El límite inferior puede ser negativo, ya que la inyección a la red se considera una potencia negativa.

El disparador envía una notificación **una sola vez por cada evento** en el que se supere el límite, no en cada medición individual. Solo cuando la potencia se ha alejado nuevamente del límite, es posible activar el proceso de nuevo. Para una condición simple del tipo «potencia superior a X», basta con utilizar el disparador de Gladys «cambio de estado de un dispositivo» aplicado a la función de potencia.

**Acción «Leer lecturas del contador»:** lee el dispositivo y transmite los datos de potencia, consumo, inyección a la red y número de contador a los pasos siguientes.

**Acción «Leer consumo en un periodo»:** calcula la suma del consumo durante un periodo determinado y transmite el resultado. Requiere el *token* de lectura.

## Cómo funciona

Dos vías para acceder al mismo dispositivo; ambas son necesarias:

- **Modbus TCP** proporciona los valores de medición. Solo responde a los comandos de lectura `0x03` y `0x04`, y únicamente tiene en cuenta el instante actual. El dispositivo admite un máximo de dos conexiones simultáneas.

- **La API REST** proporciona los datos relativos a periodos temporales, ya que es la única que conoce, por ejemplo, el consumo registrado el día anterior. Requiere el *token* de lectura y opera a través del puerto 80.

La integración lee los registros siguiendo el estándar **SunSpec**. A partir de la versión de *firmware* 1.2.1, los valores también están disponibles como números de coma flotante; en este caso, la integración utiliza esta opción. De lo contrario, realiza la conversión de los números enteros aplicando sus correspondientes factores de escala. El valor reservado por SunSpec para indicar que «el contador no proporciona este dato» se filtra y nunca se publica.

## Aspectos legales

Se trata de un **proyecto independiente y no oficial**. No mantiene **ninguna relación con SmartCircuits GmbH** ni con WattWächter; tampoco cuenta con su autorización, respaldo o patrocinio. **WattWächter** es una marca comercial propiedad de su titular; aquí se utiliza únicamente para identificar el dispositivo con el que interactúa esta integración. Todas las demás marcas, nombres de productos y nombres de empresas
pertenecen a sus respectivos propietarios.
