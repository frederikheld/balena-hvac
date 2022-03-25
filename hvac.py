#!/usr/bin/python3

import time
import RPi.GPIO as GPIO
import Adafruit_DHT as DHT

print('Hello HVAC!')

GPIO.setmode(GPIO.BOARD)

# configure pins:
pin_fan_out = 4
pin_dht22_in = 23

# set pin modes:
GPIO.setup(pin_fan_out, GPIO.OUT) # fan out

while True:
    current_humidity, current_temperature = DHT.read_entry(DHT.DHT22, pin_dht22_in)

    print('Temperature: {0:0.1f} °C, Humidity: {1:0.1f} %'. format(current_temperature, current_humidity))
    
    time.sleep(1) # sleep one second

GPIO.cleanup()