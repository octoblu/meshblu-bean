"use strict";

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Bean = require('ble-bean');
var noble = require('noble');
var tinycolor = require('tinycolor2');
var debug = require('debug')('meshblu-bean:index');
var _ = require('lodash');

var MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    color: {
      type: 'string',
      required: true
    },
    on: {
      type: 'boolean',
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
      required: true,
      default: false
    },
    broadcastTemp: {
      type: 'boolean',
      required: true,
      default: false
    },
    broadcastRSSI: {
      type: 'boolean',
      required: true,
      default: false
    },
    notifyScratch1: {
      type: 'boolean',
      required: true,
      default: false
    },
    notifyScratch2: {
      type: 'boolean',
      required: true,
      default: false
    },
    notifyScratch3: {
      type: 'boolean',
      required: true,
      default: false
    },
    notifyScratch4: {
      type: 'boolean',
      required: true,
      default: false
    },
    notifyScratch5: {
      type: 'boolean',
      required: true,
      default: false
    },
    broadcastAccelInterval: {
      type: 'integer',
      required: true,
      default: 1000
    },
    broadcastTempInterval: {
      type: 'integer',
      required: true,
      default: 1000
    },
    broadcastRSSIInterval: {
      type: 'integer',
      required: true,
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
  _.bindAll(this);
  this.getBean = _.debounce(this.getBean, 1000);
  return this;
}
util.inherits(Plugin, EventEmitter);

Plugin.prototype.discoverDevice = function(callback) {
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

  Bean.is = function(peripheral){
    return (peripheral.advertisement.localName === self.options.localName);
  }

  debug('discovering');
  Bean.discover(function(bean){
    debug('discovered');
    bean.connectAndSetup(function(){
      debug('connected and setted up');
      self._bean = bean;
      self.onMessage({payload: {color: 'deepskyblue'}});
      _.delay(function(){
        self.onMessage({payload: {color: 'black'}});
      },2000);
      callback(null, bean);
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
  if(this._bean){
    this._bean.disconnect(_.noop);
    this._bean = null;
  }

  this.setupBean();
};

Plugin.prototype.setupBean = function() {
  var self = this;

  if (!self.options.beanUuid && !self.options.localName){
    return;
  }

  self.getBean(function(error, bean, peripheral){
    if(error){
      self.emit('error', error);
      return;
    }

    if (self.options.broadcastRSSI) {
      self.pollForRssi(bean, self.options.broadcastRSSIInterval);
    }

    if (self.options.broadcastAccel) {
      bean.on('accell', function(x, y, z, valid){
        debug('data', {accel: {x: parseFloat(x), y: parseFloat(y), z: parseFloat(z)}});
        self.emit('data', {accel: {x: parseFloat(x), y: parseFloat(y), z: parseFloat(z)}});
      });
      self.poll(bean, bean.requestAccell, self.options.broadcastAccelInterval);
    }

    if (self.options.broadcastTemp) {
      bean.on('temp', function(temp, valid){
        debug('data', {temp: temp});
        self.emit('data', {temp: temp});
      });
      self.poll(bean, bean.requestTemp, self.options.broadcastTempInterval);
    }

    if (self.options.notifyScratch1) {
      bean.notifyOne(function(data){
        var buffer = new Buffer([data['0'], data['1'], data['2'], data['3']]);
        self.emit('data', {scratch1: buffer.readInt32LE(0)});
      }, _.noop);
    }

    if (self.options.notifyScratch2) {
      bean.notifyTwo(function(data){
        var buffer = new Buffer([data['0'], data['1'], data['2'], data['3']]);
        self.emit('data', {scratch2: buffer.readInt32LE(0)});
      }, _.noop);
    }

    if (self.options.notifyScratch3) {
      bean.notifyThree(function(data){
        var buffer = new Buffer([data['0'], data['1'], data['2'], data['3']]);
        self.emit('data', {scratch3: buffer.readInt32LE(0)});
      }, _.noop);
    }

    if (self.options.notifyScratch4) {
      bean.notifyFour(function(data){
        var buffer = new Buffer([data['0'], data['1'], data['2'], data['3']]);
        self.emit('data', {scratch4: buffer.readInt32LE(0)});
      }, _.noop);
    }

    if (self.options.notifyScratch5) {
      bean.notifyFive(function(data){
        var buffer = new Buffer([data['0'], data['1'], data['2'], data['3']]);
        self.emit('data', {scratch5: buffer.readInt32LE(0)});
      }, _.noop);
    }
  });
};

Plugin.prototype.poll = function(bean, func, interval){
  var self = this;
  try {
    func.call(bean, function(){
      _.delay(self.poll, interval, bean, func, interval);
    });
  } catch (error) {
    debug('error polling', error);
  }
};

Plugin.prototype.pollForRssi = function(bean, interval){
  var self = this;
  try {
    bean._peripheral.updateRssi(function(error, rssi){
      debug('data', {rssi: rssi});
      self.emit('data', {rssi: rssi});
      _.delay(self.pollForRssi, interval, bean, interval);
    });
  } catch (error) {
    debug('error polling for rssi', error);
  }
}

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
      bean.setColor(new Buffer([rgb.r, rgb.g, rgb.b]), _.noop);
    }
  });
};

module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  Plugin: Plugin
};
