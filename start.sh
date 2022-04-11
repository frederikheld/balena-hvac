#!/bin/sh

echo "Setting up i2c bus ..."

modprobe i2c-dev
i2cdetect -y 1

echo "Done."

echo "Attempting to kill running pigpio deamons ..."

PID=$(cat /var/run/pigpio.pid)

if [ $PID ]
then
    echo "pigpio process id: $PID. Trying to kill it ..."
    kill -9 $PID
else
    echo "No pigpio process found"
fi

echo "Done."

echo "Starting NodeJS app ..."

node hvac.js
