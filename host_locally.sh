#! /bin/bash

mkdir -p deploy/meshblu-bean/latest/meshblu-bean
node_modules/.bin/browserify -t coffeeify -s Connector connector.js > deploy/meshblu-bean/latest/meshblu-bean.js
hs deploy/
