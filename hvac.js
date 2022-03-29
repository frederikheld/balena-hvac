'use strict'

const { Gpio } = require('onoff')
const DHT22 = require('node-dht-sensor')

const CONFIG = {
    pins: {
        fan_out: '4',
        dht_in: '18', // GPIO18
        dht_type: '22' // using DHT22 because of the better temperature range. DHT11: 0 - 50 °C, DHT22: -40 - 125 °C
    },
    thresholds: {
        fan: {
            temp_upper: 65,
            temp_lower: 60,
            dew_point_upper: 0,
            dew_point_lower: 0
        }
    }
}

console.log('Hello NodeJS HVAC!')

// initialize pins:
const fan_out = new Gpio(CONFIG.pins.fan_out, 'out')

// initalize values:
let fanIsRunning = false

setInterval(() => {
    DHT22.read(CONFIG.pins.dht_type, CONFIG.pins.dht_in, (error, current_temperature, current_humidity) => {
        if (!error) {
            console.log(`temperature: ${current_temperature} °C, humidity: ${current_humidity} %`)
            console.log(`  fan is ${( fanIsRunning ? 'on' : 'off' )}`)

            // check temperature:
            if (current_temperature > CONFIG.thresholds.fan.temp_upper && !fanIsRunning) {
                console.log(`  temperature > ${CONFIG.thresholds.fan.temp_upper} --> turning fan on`)
                fan_out.writeSync(1)
                fanIsRunning = true
            } else if (current_temperature < CONFIG.thresholds.fan.temp_lower && fanIsRunning) {
                console.log(`  temperature < ${CONFIG.thresholds.fan.temp_upper} --> turning fan off`)
                fan_out.writeSync(0)
                fanIsRunning = false
            }

            // check dew point:


        } else {
            console.error(error)
        }
    })
}, 2000)

