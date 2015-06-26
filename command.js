'use strict';
require('coffee-script/register');
var config = require('./meshblu.json');
var Connector = require('./connector');

var connector = new Connector(config);
connector.run();
