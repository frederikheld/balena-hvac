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





