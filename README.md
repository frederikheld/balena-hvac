# Balena HVAC service

This service provides [HVAC](https://en.wikipedia.org/wiki/Heating,_ventilation,_and_air_conditioning) for balenaOS powered devices that are being operated in rough conditions where they are exposed to risks like over-heating, freezing or condensated water that can cause temporary outages or permanent damage to the circuitry or controllers.

## Features

This service will try to keep the climate inside the housing of your balena device within limits that allow safe operation without risking outages or permanent damage of the device.

Note that the service only provides the control, that activates/deactivates outputs based on sensor measurements. The effectiveness of those actions highly depends on the hardware you are controlling. For an example, you can look into my [TreeCam repository](https://github.com/frederikheld/treecam/tree/main/birdhouse)!

### Overheating Prevention

You can configure an upper temperature threshold (`TEMP_UPPER_THRESHOLD`). If the temperature goes above it, the feature will turn on an output which you can use to activate a fan or active cooling.

If the temperature falls back below the lower temperature threshold (`TEMP_LOWER_THRESHOLD`), the output will be turned off again.

The two thresholds should be far enough from each other to prevent the control from oscillating (device heats up --> fan turns on --> temp goes below threshold --> fan turns off --> device heats up again) with short cycle time.

### Dew Point Control

Condensation is dangerous to electronic devices and can also be annyoing if you want to work with optical devices (e.g. camera, light, ...) that can't function properly if the glass around it condensates.

The dew point control feature will turn on an output (which you can connect to a heating) if the current ambient temperature is too close to the current dew point temperature. The dew point is calculated from the ambient temperature and air humidity following the formula proposed by Mark G. Lawrence in 2005 ([source](https://journals.ametsoc.org/view/journals/bams/86/2/bams-86-2-225.xml)).

Like the overheating prevention, this feature will use an upper and lower margin to prevent oscillation. If the difference between the current ambient temperature and the dew point temperature is equal or less than the lower margin (`DEW_POINT_LOWER_MARGIN`), the output will be activated, of it is above the upper margin (`DEW_POINT_UPPER_MARGIN`, it will be turned off again.

## Setup

### Hardware

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

### Balena Cloud

Just set up your fleet as usualy on balenaCloud. Download the image that fits your RasPi hardware generation and flash it onto an SD card.

Before you put the SD card into the RasPi and boot for the first time, make sure to set the GPU memory to a sufficiently high value to prevent issues with the GPIO library _pigpio_ .

Set `gpu_mem=512` either in `/mnt/boot/config.txt` directly on the SD card or by setting a fleet variable `BALENA_HOST_CONFIG_gpu_mem=512` in balenaCloud. See [Advanced boot settings](https://www.balena.io/docs/reference/OS/advanced/) for details.

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

> Note: if you develop in local mode, be aware that fleet variables from the balenaCloud won't be applied! You can write them into an `.env` file instead! See the [Docker compose docs](https://docs.docker.com/compose/environment-variables/) for details. Don't forget to re-build the service if you make changes in the `.env` file as it will not be re-read on live-push events!

The logged data will automatically be tagged with the 7-digit UUID of the device as it is shown in the balena dashboard. You can use it to filter the data.

### Timings

The default measuring interval is 60 seconds (plus the time it takes to conduct the measurement and all related actions). You can change it by setting the `INTERVAL` environment variable to a value in seconds. Depeding on your use case, you might want to set it in `docker-compose.yml` or in the balenaCloud dashboard.

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
