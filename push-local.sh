#!/bin/sh

if [ -z $1 ]
then
  echo "You can use this script in local development to inject environment"
  echo "variables from an .env file into balena push. This is useful as"
  echo "fleet variables that are defined in balenaCloud will not be available"
  echo "if a device is in local mode."
  echo ""
  echo "Please provide the local device url to push to as a parameter!"
  echo "Example:"
  echo "  $ sh $0 1234567.local"
  echo "You can find the device url via"
  echo "  $ sudo balena scan"

else
  if [ -f ".env" ]
  then
    grep -v -e '^#' -e '^$' .env | sed 's/^/--env /' | xargs balena push $1
  else
    echo "No .env file found!"
    echo "If you don't need it, you can use the default"
    echo "  $ balena push $1"
    echo "command instead."
  fi
fi
