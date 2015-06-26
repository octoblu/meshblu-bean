util           = require 'util'
{EventEmitter} = require 'events'
noble          = require 'noble'
Bean           = require '@octoblu/ble-bean'
tinycolor      = require 'tinycolor2'
debug          = require('debug')('meshblu-bean:index')
_              = require 'lodash'

MESSAGE_SCHEMA =
  type: 'object'
  properties:
    color:
      type: 'string'
    on:
      type: 'boolean'
      required: false

OPTIONS_SCHEMA =
  type: 'object'
  properties:
    localName:
      type: 'string'
    broadcastAccel:
      type: 'boolean'
      default: false
    broadcastTemp:
      type: 'boolean'
      default: false
    broadcastRSSI:
      type: 'boolean'
      default: false
    notifyScratch1:
      type: 'boolean'
      default: false
    notifyScratch2:
      type: 'boolean'
      default: false
    notifyScratch3:
      type: 'boolean'
      default: false
    notifyScratch4:
      type: 'boolean'
      default: false
    notifyScratch5:
      type: 'boolean'
      default: false
    broadcastAccelInterval:
      type: 'integer'
      default: 5000
    broadcastTempInterval:
      type: 'integer'
      default: 5000
    broadcastRSSIInterval:
      type: 'integer'
      default: 5000
    timeout:
      type: 'integer'
      default: 30000

class Plugin extends EventEmitter
  constructor: ->
    @setOptions {}
    @messageSchema = MESSAGE_SCHEMA
    @optionsSchema = OPTIONS_SCHEMA

    @getBean = _.debounce @getBean, 1000

  didBeanChange: (bean) =>
    return false unless bean?
    return bean._peripheral.advertisement.localName != @options.localName

  getBean: (callback=->) =>
    return _.defer callback, null, @_bean if @didBeanChange(@_bean)

    Bean.is = (peripheral) =>
      peripheral.advertisement.localName == @options.localName

    Bean.discover (bean) =>
      bean.connectAndSetup =>
        @_bean = bean
        callback(null, bean)

  onMessage: (message) =>
    debug 'onMessage', message
    @updateBean message.payload

  onConfig: (device) =>
    debug 'onConfig', device.options
    @setOptions device.options

  setOptions: (@options={}) =>
    debug 'setOptions', @options
    @disconnectBean() if @_oldBeanName == @options.localName
    @_oldBeanName = @options.localName
    @setupBean()

  disconnectBean:  =>
    return unless @_bean?
    @_bean.disconnect =>
    @_bean = null

  pollForRssi: (bean) =>
    clearInterval @_pollForRssiInterval
    @_pollForRssiInterval = setInterval =>
      bean._peripheral.updateRssi (error, rssi) =>
        data = rssi: rssi
        debug 'rssi data', data
        @emit 'data', data
    , @options.broadcastRSSIInterval

  pollForAccell: (bean) =>
    bean.on 'accell', (x, y, z, valid) =>
      data =
        accell:
          x: parseFloat x
          y: parseFloat y
          z: parseFloat z
      debug 'accel data', data
      @emit 'data', data
    requestAccell = _.bind bean.requestAccell, bean
    clearInterval @_pollForAccellInterval
    @_pollForAccellInterval = setInterval requestAccell, @options.broadcastAccelInterval

  pollForTemp: (bean) =>
    bean.on 'temp', (temp, valid) =>
      data = temp: temp
      debug 'temp data', data
      @emit 'data', data

    requestTemp = _.bind bean.requestTemp, bean
    clearInterval @_pollForTempInterval
    @_pollForTempInterval = setInterval requestTemp, @options.broadcastTempInterval

  notifyScratch: (key, scratchFunc) =>
    scratchFunc (data) =>
      buffer = new Buffer [data['0'], data['1'], data['2'], data['3']]
      data = {}
      data[key] = buffer.readInt32LE 0
      @emit 'data', data
    , _.noop

  setupBean: =>
    return unless @options.localName?

    @getBean (error, bean) =>
      return @emit 'error', error if error?

      @pollForRssi bean if @options.broadcastRSSI
      @pollForAccell bean if @options.broadcastAccel
      @pollForTemp bean if @options.broadcastTemp
      @notifyScratch 'scratch1', bean.notifyOne   if @options.notifyScratch1
      @notifyScratch 'scratch2', bean.notifyTwo   if @options.notifyScratch2
      @notifyScratch 'scratch3', bean.notifyThree if @options.notifyScratch3
      @notifyScratch 'scratch4', bean.notifyFour  if @options.notifyScratch4
      @notifyScratch 'scratch5', bean.notifyFive  if @options.notifyScratch5

      @setBeanColor bean, 'blue'
      _.delay @setBeanColor, 2000, bean, 'black'

  updateBean: (payload={}) =>
    @getBean (error, bean) =>
      return @emit 'error', error if error?

      color = 'black'
      color = payload.color if payload.on
      @setBeanColor bean, color

  setBeanColor: (bean, color) =>
    rgb = tinycolor(color).toRgb();
    bean.setColor new Buffer([rgb.r, rgb.g, rgb.b]), _.noop

module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  Plugin: Plugin
};
