# Balena HVAC service

This service provides [HVAC](https://en.wikipedia.org/wiki/Heating,_ventilation,_and_air_conditioning) for balenaOS powered devices that are being operated in rough conditions where they are exposed risks like over-heating, freezing or condensated water that can cause temporary outages or permanent damage to the circuitry or controllers.

> NOTE: this is work in progress in an early stage!

## Features

This service will try to keep the climate inside the housing of your balena device within limits that allow safe operation without risking outages or permanent damage of the device.

- [ ] ventilation
- [ ] active heating
- [ ] active cooling
- [ ] temperature control
- [ ] dew point control
- [ ] sending email warnings
- [ ] temperature and humidity logging to Grafana

### Temperature Control

You can configure an upper and a lower temperature limit. The service will try to keep the environment temperature between those limits by activating entilation, heating or cooling. If the temperature can't be kept inside the limits, the service will send an e-mail to a configured address to warn about the situation.

### Dew Point Control

The service will also try to keep humidity and temperature in a range that prevents the formation of condensated water. This needs no configuration as the dew point is defined by physics. If the service fails to prevent the formation of condensated water, it will send an e-mail to a configured address to warn about the situation.

## Setup

Just set up your fleet as usualy on balenaCloud.

Before you deploy your first machine, make sure to set `gpu_mem=512` either in `/mnt/boot/config.txt` directly on the SD card or by setting a fleet variable `BALENA_HOST_CONFIG_gpu_mem=512` in balenaCloud.

See [Advanced boot settings](https://www.balena.io/docs/reference/OS/advanced/) for details.

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