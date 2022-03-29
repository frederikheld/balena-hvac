'use strict'

const { Gpio } = require('onoff')
const dht22 = require('node-dht-sensor')
const bme280 = require('bme280')

const CONFIG = {
    devices: {
        bme280: {
            i2c_bus: 1,
            i2c_address: 0x76
        },
        fan: {
            pin_out: '26' // GPIO26
        },
        dht: {
            type: '22',  // using DHT22 because of the better temperature range. DHT11: 0 - 50 °C, DHT22: -40 - 125 °C,
            pin_in: '18', // GPIO18
        }
    },
    thresholds: {
        fan: {
        //     temp_upper: 65,
        //     temp_lower: 60,
            temp_upper: 55,
            temp_lower: 50,
            dew_point_upper: 0,
            dew_point_lower: 0
        }
    }
}

console.log('Hello from balena-hvac!')

// init GPIO:
const fan_out = new Gpio(CONFIG.devices.fan.pin_out, 'out')

// initalize values:
let fan_is_running = false

setInterval(async () => {

    console.log('---')

    try {
        const { temperature, humidity } = await readDHT(CONFIG.devices.dht.type, CONFIG.devices.dht.pin_in)
        console.log(`DHT22:  temperature: ${temperature} °C, humidity: ${humidity} %`)
    } catch (error) {
        console.log(error)
    }

    try {
        const { temperature, humidity, pressure } = await readBME280(CONFIG.devices.bme280.i2c_bus, CONFIG.devices.bme280.i2c_address)
        console.log(`BME280: temperature: ${temperature.toFixed(2)} °C, humidity: ${humidity.toFixed(2)} %, pressure: ${pressure.toFixed(2)} hPa, dew point: ${calculateDewPointTemperature(temperature, humidity).toFixed(2)} °C`)

        const result = fanControl (fan_out, temperature, CONFIG.thresholds.fan, fan_is_running)
        fan_is_running = result.fan_is_running
     
        // console.log(`fanControl: ${JSON.stringify(result)}`)

        if (result.fan_was_turned_on) {
            console.log(`  temperature > ${CONFIG.thresholds.fan.temp_upper} °C --> turning fan on (${fan_is_running})`)
        } else if (result.fan_was_turned_off) {
            console.log(`  temperature < ${CONFIG.thresholds.fan.temp_upper} °C --> turning fan off (${fan_is_running})`)
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

    // check temperature:
    if (current_temperature > thresholds.temp_upper && !fan_is_running) {
        fan_out.writeSync(1)

        fan_is_running_return = true
        fan_was_turned_on = true
    } else if (current_temperature < thresholds.temp_lower && fan_is_running) {
        fan_out.writeSync(0)

        fan_is_running_return = false
        fan_was_turned_off = true
    }

    return { fan_is_running: fan_is_running_return, fan_was_turned_on, fan_was_turned_off }
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

/**
 * This function calculates a rough estimation of the dew point temperature.
 * It does not not need barometric pressure as an input and works well for
 * a relative humidity above 50 % but doesn't produce useful values for a
 * relative humidity below 50 %.
 *
 * Source: https://iridl.ldeo.columbia.edu/dochelp/QA/Basic/dewpoint.html
 * 
 * @param {Number} observed_temperature Observed temperature in °C
 * @param {Number} relative_humidity Relative humidity in %
 * @returns Approximated dew point temperature in °C
 */
function calculateRoughDewPointTemperature (observed_temperature, relative_humidity) {
    const dew_point_temperature = observed_temperature ((100 - relative_humidity) / 5)

    return dew_point_temperature
}
