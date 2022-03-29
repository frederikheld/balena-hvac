'use strict'

const { Gpio } = require('onoff')
const DHT22 = require('node-dht-sensor')

const CONFIG = {
    pins: {
        fan_out: '4',
        dht_in: '18', // GPIO18
        dht_type: '11'
    }
}

console.log('Hello NodeJS HVAC!')

// initialize pins:
const fan_out = new Gpio(CONFIG.pins.fan_out, 'out')

// initialize values:
let fan_value = 1

setInterval(() => {
    DHT22.read(CONFIG.pins.dht_type, CONFIG.pins.dht_in, (error, current_temperature, current_humidity) => {
        if (!error) {
            console.log(`temperature: ${current_temperature} C, humidity: ${current_humidity} %`)
        } else {
            console.error(error)
        }
    })

    fan_out.writeSync(fan_value)
    console.log(`Fan set to ${fan_value}`)
    fan_value = +!fan_value
}, 2000)
