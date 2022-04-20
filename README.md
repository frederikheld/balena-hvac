# Balena HVAC service

This service provides [HVAC](https://en.wikipedia.org/wiki/Heating,_ventilation,_and_air_conditioning) for balenaOS powered devices that are being operated in rough conditions where they are exposed risks like over-heating, freezing or condensated water that can cause temporary outages or permanent damage to the circuitry or controllers.

> NOTE: this is work in progress in an early stage!

## Features

This service will try to keep the climate inside the housing of your balena device within limits that allow safe operation without risking outages or permanent damage of the device.

- [x] ventilation
- [x] active heating
- [ ] active cooling
- [x] temperature control
- [x] dew point control
- [ ] sending email warnings if automation can't cope with an edge case
- [x] temperature and humidity logging to InfluxDB

### Temperature Control

You can configure an upper and a lower temperature limit. The service will try to keep the environment temperature between those limits by activating entilation, heating or cooling. If the temperature can't be kept inside the limits, the service will send an e-mail to a configured address to warn about the situation.

### Dew Point Control

The service will also try to keep humidity and temperature in a range that prevents the formation of condensated water. This needs no configuration as the dew point is defined by physics. If the service fails to prevent the formation of condensated water, it will send an e-mail to a configured address to warn about the situation.

## Setup

Just set up your fleet as usualy on balenaCloud. Download the image that fits your RasPi hardware generation and flash it onto an SD card.

Before you put the SD card into the RasPi and boot for the first time, do the following steps:

### Prepare SD card

Before you deploy your first machine, make sure to set `gpu_mem=512` either in `/mnt/boot/config.txt` directly on the SD card or by setting a fleet variable `BALENA_HOST_CONFIG_gpu_mem=512` in balenaCloud.

See [Advanced boot settings](https://www.balena.io/docs/reference/OS/advanced/) for details.

### Hardware configuration

`balena-hvac` expects an _Bosch MBE280_ sensor that is connected via I2C bus as well as a fan and a heating that are connected via GPIO. You can set the addresses and pins via environment variables. As the hardware is not expected to change during the lifetime of your device, it is best to set those variables in `docker-compose.yml`.

| variable | purpose | default |
| - | - | - |
| `BME280_I2C_BUS` | Defines the I2C bus to which the sensor is connected to | 1 |
| `BME280_I2C_ADDRESS` | The ID of the sensor. This is hardware specific and should be printed on the board. | 0x76 |
| `FAN_OUT` | GPIO output pin (digital) for the fan control | 18 |
| `HEATING_OUT` | GPIO output pin (digital) for the heating control | 23 |
| `TEMP_UPPER_THRESHOLD` | If the ambient temperature goes above this value (in °C), the fan will be turned on | 65 |
| `TEMP_LOWER_THRESHOLD` | If the ambient temperature goes below this value (in °C), the fan will be turned off | 60 |
| `DEW_POINT_LOWER_MARGIN` | If the ambient temperature is less (or equal) than this value (in K) away from the ambient temperature, the heating will be turned on | 10 |
| `DEW_POINT_UPPER_MARGIN` | If the ambient temperature is more than this value (in K) away from the ambient temperature, the heating will be turned off | 15 |

### Log to InfluxDB

If you want to have your data logged to InfluxDB, you have to provide the credentials and context via environment variables. As those settings might change during the lifetime of your device, it is best to set them as fleet variables via the balena dashboard:

```
INFLUX_URL
INFLUX_ORG
INFLUX_BUCKET
INFLUX_TOKEN
```

Fill in the values for your InfluxDB instance. Make sure that you use upper case as those variables are case-sensitive. If they are not used in other services, you should also restrict them to the _hvac_ service.

To turn the feature on, you also need to create a variable `FEATURE_LOG_TO_INFLUXDB_ACTIVE=1`.

> Note: those fleet variables will not be applied in local mode. You can write them into an `.env` file instead! See the [Docker compose docs](https://docs.docker.com/compose/environment-variables/) for details. Note that you need to re-build the service if you make changes in the .env file as it will not be re-read on live-push events!

The logged data will automatically be tagged with the 7-digit UUID of the device as shown in the balena dashboard. You can use it to filter the data.

### Timings

The default measuring interval is 60 seconds (plus the time it takes to conduct the measurement and all related actions). You can change it by setting the `INTERVAL` environment variable to a value in seconds. Depeding on your use case, you might want to set it in `docker-compose.yml` or in the balena dashboard.

## Known Issues

When using balenaOS live-reload, pigpio might fail with the following error:

```
initInitialise: Can't lock /var/run/pigpio.pid
/app/node_modules/pigpio/pigpio.js:54
pigpio.gpioInitialise();
       ^
 
Error: pigpio error -1 in gpioInitialise
```

The service will re-boot until the initialization succeeds. I'm not quite sure what causes this because according to internet sources this happens if `pigpiod` daemon of the C library wasn't shut down correctly but the `pigpio` NodeJS library uses the C library directly (without the deamon) which is backed by the fact that I couldn't see any `pigpiod` process running inside of the container. Increasing `gpu_mem` to 512 MB was the way to fix it from "always failing" to "succeeding after a couple of attempts".

## Local Development

Fleet variables that are defined in the balenaCloud will not be available in devices that are run in local mode. You can use the following approach instead:

1. Create a file `.env` that contains one key value pair per line, e. g. `INFLUX_URL="https://path.to.influx.db/"`.
2. Instead of `$ balena push 1234567.local`, run `$ sh push-local.sh 1234567.local` to push to the local device

## Snippets

A collection of snippets that help in development. You won't need those if you're a balena and influx pro, but they come in handy for beginners with bad memory like me.

### Delete data from InfluxDB

You can't delete data from the InfluxData dashboard, but you can do it via the API. Easiest way is via the Influx CLI:

```sh
$ influx delete -c TreeCam --bucket TreeCam --start '1970-01-01T00:00:00Z' --stop $(date +"%Y-%m-%dT%H:%M:%SZ") --predicate 'device="3be22693b1d3a37fbe7fbb59d"'
```

You always have to provide `--start` and `--end`, even if you want to delete all data that match the predicate. You have to explicitly define a time range that includes all data points, like this example which defines the time range "from the dawn of (UNIX) time" to "this very moment".

`predicate` filters the data. The syntax is different from the Flux language, but the semantics are the same. The easiest way to figure out what you want to filter is to use the InfluxData Data Explorer, click together the filter criteria and then look into the Script Editor to see the names of the fields.

You'll more details on deleting data via the CLI [here](https://docs.influxdata.com/influxdb/cloud/write-data/delete-data/#delete-data-using-the-influx-cli).
