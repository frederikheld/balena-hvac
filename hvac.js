'use strict'

const deviceUUID = process.env.BALENA_DEVICE_UUID.slice(0, 7) // this will create the short UUID as displayed in the balena dashboard

// RasPi GPIO & sensors
const { Gpio } = require('pigpio')
const dht22 = require('node-dht-sensor')
const bme280 = require('bme280')

// InfluxDB
const { InfluxDB, Point } = require('@influxdata/influxdb-client')
const influxConfig = {
    url: process.env.INFLUX_URL,
    token: process.env.INFLUX_TOKEN,
    org: process.env.INFLUX_ORG,
    bucket: process.env.INFLUX_BUCKET
}
const influxClient = new InfluxDB({ url: influxConfig.url, token: influxConfig.token })
const influxWriteApiTreeCam = influxClient.getWriteApi(influxConfig.org, influxConfig.bucket)
influxWriteApiTreeCam.useDefaultTags({ device: deviceUUID })

const CONFIG = {
    devices: {
        bme280: {
            i2c_bus: parseInt(process.env.BME280_I2C_BUS || 1),
            i2c_address: parseInt(process.env.BME280_I2C_ADDRESS || 0x76)
        },
        fan: {
            pin_out: process.env.FAN_OUT || '18'
        },
        heating: {
            pin_out: process.env.HEATING_OUT || '23'
        }
    },
    thresholds: {
        fan: {
            temp_upper: parseInt(process.env.TEMP_UPPER_THRESHOLD || 65),
            temp_lower: parseInt(process.env.TEMP_LOWER_THRESHOLD || 60),
        },
        heating: {
            temp_upper_margin: parseInt(process.env.DEW_POINT_UPPER_MARGIN || 15), // will stop the heating if the current temperature is 15 °C or more below the current temperature
            temp_lower_margin: parseInt(process.env.DEW_POINT_LOWER_MARGIN || 10)  // will start the heating if the dew point is 10 °C or less below the current temperature 
        }
    }
}

console.log('Hello from balena-hvac!')
console.log('  device_uuid:', deviceUUID)
console.log('  features:')
console.log('    log to InfluxDB:', process.env.FEATURE_LOG_TO_INFLUXDB_ACTIVE === '1' ? 'active' : 'inactive')
if (process.env.FEATURE_LOG_TO_INFLUXDB_ACTIVE === '1') {
    console.log('      using INFLUX_URL:', process.env.INFLUX_URL)
    console.log('      using INFLUX_ORG:', process.env.INFLUX_ORG)
    console.log('      using INFLUX_BUCKET:', process.env.INFLUX_BUCKET)
}

// init GPIO:
const fan_out = new Gpio(CONFIG.devices.fan.pin_out, { mode: Gpio.OUTPUT })
const heating_out = new Gpio(CONFIG.devices.heating.pin_out, { mode: Gpio.OUTPUT }) // TODO: should be PWM!

// initalize state:
let fan_is_running = false
let heating_is_running = false

// initialize devices:
fan_out.digitalWrite(fan_is_running ? 1 : 0)
heating_out.digitalWrite(heating_is_running ? 1 : 0)

// DEBUG:
// runPwmDebug (fan_out) // only activate if needed!

setInterval(async () => {

    console.log('---')

    // printing DHT22 measurements for comparison:
    // try {
    //     const { temperature, humidity } = await readDHT(CONFIG.devices.dht.type, CONFIG.devices.dht.pin_in)
    //     console.log(`DHT22:  temperature: ${temperature.toFixed(2)} °C, humidity: ${humidity.toFixed(2)} %, dew point: ${calculateDewPointTemperature(temperature, humidity).toFixed(2)} °C`)
    // } catch (error) {
    //     console.log(error)
    // }

    // using BME280 measurements for the controls:
    try {

        // get current measurements:

        const { temperature, humidity, pressure } = await readBME280(CONFIG.devices.bme280.i2c_bus, CONFIG.devices.bme280.i2c_address)
        console.log(`BME280: temperature: ${temperature.toFixed(2)} °C, humidity: ${humidity.toFixed(2)} %, dew point: ${calculateDewPointTemperature(temperature, humidity).toFixed(2)} °C, pressure: ${pressure.toFixed(2)} hPa`)

        // fan control:

        const result_fan = fanControl(fan_out, temperature, CONFIG.thresholds.fan, fan_is_running)
        fan_is_running = result_fan.fan_is_running

        if (result_fan.fan_was_turned_on) {
            console.log(`  temperature > ${CONFIG.thresholds.fan.temp_upper} °C --> turning fan on (${fan_is_running})`)
        } else if (result_fan.fan_was_turned_off) {
            console.log(`  temperature < ${CONFIG.thresholds.fan.temp_upper} °C --> turning fan off (${fan_is_running})`)
        }

        // heating control:

        const dew_point_temperature = calculateDewPointTemperature(temperature, humidity)

        const result_heating = heatingControl(heating_out, temperature, dew_point_temperature, CONFIG.thresholds.heating, heating_is_running)
        heating_is_running = result_heating.heating_is_running

        if (result_heating.heating_was_turned_on) {
            console.log(`  temperature approaches dew point (difference < ${CONFIG.thresholds.heating.temp_lower_margin} °C) --> turning heating on (${heating_is_running})`)
        } else if (result_heating.heating_was_turned_off) {
            console.log(`  temperature moves away from dew point (difference > ${CONFIG.thresholds.heating.temp_upper_margin} °C) --> turning heating off (${heating_is_running})`)
        }

        // write values to database:
        if (process.env.FEATURE_LOG_TO_INFLUXDB_ACTIVE === '1') {
            await writeValuesToInfluxDB(influxWriteApiTreeCam, { temperature, humidity, pressure, dew_point_temperature, }, 'environment', 'float', [{ key: 'sensor', value: 'bme280' }])
            await writeValuesToInfluxDB(influxWriteApiTreeCam, { fan_is_running, heating_is_running }, 'state', 'boolean')
        }
     
    } catch (error) {
        console.log(error)
    }

}, 10000)

/**
 * 
 * @param {initialized GPIO out pin} fan_out Use onoff library to initialize this pin as 'out'
 * @param {Number} current_temperature 
 * @param {Object} thresholds { temp_upper, temp_lower }
 * @param {Boolean} fan_is_running 
 * @returns 
 */
function fanControl(fan_out, current_temperature, thresholds, fan_is_running = false) {

    let fan_is_running_return = fan_is_running
    let fan_was_turned_on = false
    let fan_was_turned_off = false

    if (current_temperature > thresholds.temp_upper && !fan_is_running) {
        fan_out.digitalWrite(1)

        fan_is_running_return = true
        fan_was_turned_on = true
    } else if (current_temperature < thresholds.temp_lower && fan_is_running) {
        fan_out.digitalWrite(0)

        fan_is_running_return = false
        fan_was_turned_off = true
    }

    return { fan_is_running: fan_is_running_return, fan_was_turned_on, fan_was_turned_off }
}

function heatingControl (heating_out, current_temperature, dew_point_temperature, thresholds, heating_is_running = false) {

    let heating_is_running_return = heating_is_running
    let heating_was_turned_on = false
    let heating_was_turned_off = false

    if (current_temperature - thresholds.temp_lower_margin < dew_point_temperature && !heating_is_running) {
        heating_out.digitalWrite(1)

        heating_is_running_return = true
        heating_was_turned_on = true
    } else if (current_temperature - thresholds.temp_upper_margin > dew_point_temperature && heating_is_running) {
        heating_out.digitalWrite(0)

        heating_is_running_return = false
        heating_was_turned_off = true
    }

    return { heating_is_running: heating_is_running_return, heating_was_turned_on, heating_was_turned_off }
}

/**
 * Reads data from a DHT sensor.
 * 
 * Returns a promise which - on resolve - can be destructured
 * into `{ temperature, humidity }`.
 * 
 * On reject the promise will contain the error.
 * 
 * @param {String} dht_type Type of DHT sensor (11 or 22)
 * @param {String} pin_data GPIO pin connected to data out on the DHT sensor
 * @returns 
 */
async function readDHT (dht_type, pin_data) {
    return new Promise ((resolve, reject) => {
        dht22.read(dht_type, pin_data, (error, temperature, humidity) => {
            if (!error) {
                resolve({ temperature, humidity })
            } else {
                reject(error)
            }
        })
    })
}

/**
 * Reads data from the BMC280 sensor.
 * 
 * Returns a promise which - on resolve - can be destructured
 * into { temperature, humidity, pressure } where
 *  - temperature: temperature in °C
 *  - humidity: relative humidity in %
 *  - pressure: barometric pressure in hPa
 * 
 * On reject it will contain the error.
 * 
 * @param {Number} i2c_bus Number of the I2C bus. For most models of RasPi this is 1, for older models it might be 0
 * @param {Number} i2c_address Adress of the sensor on the bus. If it is a sensor module, it is usually printed on the board. It can also be determined on the command line with `i2cdetect -y <i2c_bus>`.
 * @returns 
 */
async function readBME280 (i2c_bus, i2c_address) {
    return new Promise((resolve, reject) => {
        bme280.open({
            i2cBusNumber: i2c_bus,
            i2cAddress: i2c_address
        }).then(async sensor => {
            const values = await sensor.read()
            await sensor.close()
            resolve({ temperature: values.temperature, humidity: values.humidity, pressure: values.pressure })
        }).catch(error => {
            reject(error)
        })
    })
}

function calculateDewPointTemperature (observed_temperature, relative_humidity) {

    // constants:
    const a = 17.625
    const b = 243.04

    // fix humidity if it is 0 (which can happen at high temperatures) because log(0) is undefined:
    const humidity = (relative_humidity === 0 ? 0.00001 : relative_humidity)
    
    const step_2 = (observed_temperature * a) / (observed_temperature + b)
    const step_3 = Math.log(humidity / 100) + step_2
    const dew_point_temperature = (b * step_3) / (a - step_3)

    // console.log(` >> step_2: ${step_2}, step_3: ${step_3}, result: ${dew_point_temperature}`)

    return dew_point_temperature

    // source: https://www.omnicalculator.com/physics/dew-point
    
}

async function writeValuesToInfluxDB (influxWriteApi, valuesObject, measurement, dataType, tags = []) {
    // console.log('writeValuesToInfluxDB', measurement, dataType, 'valuesObject:', valuesObject)

    if (valuesObject) {
        const influxPoint = new Point(measurement)

        for (const tag of tags) {
            influxPoint.tag(tag.key, tag.value)
        }

        for (const [key, value] of Object.entries(valuesObject)) {
            switch (dataType) {
                case 'boolean':
                    influxPoint.booleanField(key, value)
                    break
                case 'float':
                    influxPoint.floatField(key, value)
                    break
                case 'int':
                    influxPoint.intField(key, value)
                    break
                case 'string':
                default:
                    influxPoint.stringField(key, value)
            }
        }

        await influxWriteApi.writePoint(influxPoint)
    }
}

/**
 * Runs a PWM sequence that can be used to debug PWM controlled devices.
 * 
 * @param {initialized Gpio output} gpio_out_to_be_tested 
 */
function runPwmDebug (gpio_out_to_be_tested) {
    setTimeout(() => {
        gpio_out_to_be_tested.pwmWrite(255)

        setTimeout(() => {
            gpio_out_to_be_tested.pwmWrite(150)

            setTimeout(() => {
                gpio_out_to_be_tested.pwmWrite(100)

                setTimeout(() => {
                    gpio_out_to_be_tested.pwmWrite(50)

                    setTimeout(() => {
                        gpio_out_to_be_tested.pwmWrite(0)

                        setTimeout(() => {
                            gpio_out_to_be_tested.pwmWrite(50)

                            setTimeout(() => {
                                gpio_out_to_be_tested.pwmWrite(100)

                                setTimeout(() => {
                                    gpio_out_to_be_tested.pwmWrite(150)

                                    setTimeout(() => {
                                        gpio_out_to_be_tested.pwmWrite(200)

                                        setTimeout(() => {
                                            gpio_out_to_be_tested.pwmWrite(255)

                                            setTimeout(() => {
                                                gpio_out_to_be_tested.pwmWrite(0)
                                            }, 1000)
                                        }, 1000)
                                    }, 1000)
                                }, 1000)
                            }, 1000)
                        }, 1000)
                    }, 1000)
                }, 1000)
            }, 1000)
        }, 1000)
    }, 1000)
}