"use strict";

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var beanAPI = require('ble-bean');
var noble = require('noble');
var tinycolor = require('tinycolor2');
var debug = require('debug')('meshblu-bean:index');
var _ = require('lodash');

var MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    color: {
      type: 'string',
      required: false
    }
  }
};

var OPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    beanUuid: {
      type: 'string',
      required: true,
      default: ''
    },
    localName: {
      type: 'string',
      required: true,
      default: ''
    },
    broadcastAccel: {
      type: 'boolean',
      required: false,
      default: false
    },
    broadcastTemp: {
      type: 'boolean',
      required: false,
      default: false
    },
    broadcastAccelInterval: {
      type: 'integer',
      required: false,
      default: 1000
    },
    broadcastTempInterval: {
      type: 'integer',
      required: false,
      default: 1000
    },
    timeout: {
      type: 'integer',
      required: true,
      default: 30000
    }
  }
};

function Plugin(){
  this.setOptions({});
  this.messageSchema = MESSAGE_SCHEMA;
  this.optionsSchema = OPTIONS_SCHEMA;
  return this;
}
util.inherits(Plugin, EventEmitter);

Plugin.prototype.discoverDevice = function(callback) {
  var done, self, timeout;
  self = this;

  done = function() {
    noble.stopScanning();
    noble.removeAllListeners('discover');
  };

  timeout = setTimeout(function(){
    done();
    callback(new Error('Device Not Found'));
  }, self.options.timeout);
  
  self.timeout = timeout;

  noble.on('discover', function(peripheral){
	  debug('Discovered a bean', peripheral.uuid, peripheral.advertisement.localName);
    if (peripheral.uuid === self.options.beanUuid || self.options.localName === peripheral.advertisement.localName) {
      debug('Matched a bean', peripheral.advertisement.localName, peripheral.uuid);
      clearTimeout(timeout);
      done();
      if(self.timeout === timeout) {
        callback(null, peripheral);
      }
    }
  });
  noble.startScanning([beanAPI.UUID], true);
};

Plugin.prototype.discoverService = function(peripheral, callback) {
  peripheral.discoverServices([beanAPI.UUID], function(err, services){
    callback(err, _.first(services));
  });
};

Plugin.prototype.getBean = function(callback){
  var self = this;

  if(self._bean){
    _.defer(function(){
      callback(null, self._bean);
    });
    return;
  }

  self.discoverDevice(function(err, peripheral){
    if (err){
      self._bean = null;
      callback(err);
      return;
    }
    peripheral.connect(function(){
      self.discoverService(peripheral, function(err, service) {
        if (err) {
          callback(err);
          return;
        }
        self._bean = new beanAPI.Bean(service);
        self._bean.on('ready', function(err){
          debug('chara', self._bean.chara);
          callback(err, self._bean);
          self.onMessage({payload: {color: 'deepskyblue'}});
        });
      });
    });
  });
};

Plugin.prototype.onMessage = function(message){
  var payload = message.payload;
  debug('received message', message);
  this.updateBean(payload);
};

Plugin.prototype.onConfig = function(device){
  debug('onConfig', device.options);
  this.setOptions(device.options||{});
};

Plugin.prototype.setOptions = function(options){
  debug('setOptions', options);
  this.options = options || {};
  this._bean = null;

  this.setupBean();
};

Plugin.prototype.setupBean = function() {
  var self = this;

  if (!self.options.beanUuid && !self.options.localName){
    return;
  }

  self.getBean(function(error, bean){
    if(error){
      self.emit('error', error);
      return;
    }

    if (self.options.broadcastAccel) {
      bean.on('accell', function(x, y, z, valid){
        self.emit('data', {accel: {x: parseFloat(x), y: parseFloat(y), z: parseFloat(z)}});
      });
      setInterval(function(){
        bean.requestAccell();
      }, self.options.broadcastAccelInterval);
    }

    if (self.options.broadcastTemp) {
      bean.on('temp', function(temp, valid){
        self.emit('data', {temp: temp});
      });
      setInterval(function(){
        bean.requestTemp();
      }, self.options.broadcastTempInterval);
    }
  });
};

Plugin.prototype.updateBean = function(payload){
  var self, rgb;
  self = this;

  self.getBean(function(error, bean){
    if(error){
      console.error('Error getting the bean', error);
      self.emit('error', error);
      return;
    }

    if(payload.on === false) {
      payload.color = 'black';
    }

    if(payload.color){
      rgb = tinycolor(payload.color).toRgb();
      bean.setColor(new Buffer([rgb.r, rgb.g, rgb.b]));
    }


  });
};

module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  Plugin: Plugin
};
