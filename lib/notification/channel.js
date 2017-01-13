'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var _ = require('lodash');

var Notification = require('./notification');

/**
 * Channel component
 * 
 * Emits the following events:
 * - `start` - after start command from socket
 *    callback signature `function({ message: { id: id, target: target }, cancel: false })`
 * - `stop` - after stop command from socket
 *    callback signature `function({ message: { id: id }, cancel: false })`
 * - `send` - after send command from socket (or `Channel.send()`)
 *    callback signature `function({ message: { info: info, target: target }, cancel: false })`
 * - `receive` - after receive command from notification component
 *    callback signature `function({ message: { id: id, info: info, target: target }, cancel: false })`
 * - `error` - in case of any errors, callback signature `function(error)` 
 * 
 * options.name (optional) - {String}, name of the component, default value - "notification"
 * Internally used as a part of socket events names, i.e. [event name] = options.name + ':' + [short event name]
 *
 * options.eventStart (optional) - {String}, name of the start event for socket, default value - options.name + ':start'
 *
 * options.eventStop (optional) - {String}, name of the stop event for socket, default value - options.name + ':stop'
 *
 * options.eventReceive (optional) - {String}, name of the receive event for socket, default value - options.name + ':receive'
 *
 * options.eventSend (optional) - {String}, name of the send event for socket, default value - options.name + ':send'
 * 
 * options.notificationStart (optional) - {Object|Notification}, krot notification component (or options to init it) for start messages
 * Can be used to organize message exchange from external sources
 * 
 * options.notificationStop (optional) - {Object|Notification}, krot notification component (or options to init it) for stop messages
 * Can be used to organize message exchange from external sources
 * 
 * @param {Object} io - mandatory, socket.io component
 * @param {Object|Notification} notification - optional, krot notification component (or options to init it) for sending/receiving messages
 * @param {Object} options - optional parameter
 */
var Channel = function (io, notification, options) {
    Channel.super_.call(this);

    options = options || {};

    this._io = io;
    this._notification = notification;
    this._name = options.name || 'notification'; 
    this._eventStart = options.eventStart || this._name + ':start';
    this._eventStop = options.eventStop || this._name + ':stop';
    this._eventReceive = options.eventReceive || this._name + ':receive';
    this._eventSend = options.eventSend || this._name + ':send';
    this._notificationStart = options.notificationStart;
    this._notificationStop = options.notificationStop;

    this._initialize();
};

util.inherits(Channel, EventEmitter);

/**
 * Initializes component, for internal use only
 * 
 */
Channel.prototype._initialize = function () {
    var that = this;
    if (!(that._notification instanceof Notification)) {
        that._notification = new Notification(that._notification);
        that._notification.on('error', that._errorHandler.bind(that));
    }
    if (that._notificationStart && !(that._notificationStart instanceof Notification)) {
        that._notificationStart = new Notification(that._notificationStart);
        that._notificationStart.on('error', that._errorHandler.bind(that));
    }
    if (that._notificationStop && !(that._notificationStop instanceof Notification)) {
        that._notificationStop = new Notification(that._notificationStop);
        that._notificationStop.on('error', that._errorHandler.bind(that));
    }

    that._io.on('connection', function(socket) {

        var onStop = function() {
            var data = {
                message: {
                    id: socket.id
                },
                cancel: false
            };
            that.emit('stop', data);
            if (data.cancel) {
                return;
            }
            if (that._notificationStop) {
                that._notificationStop.publish(data.message);
            }
            that._notification.unsubscribe(data.message.id);
        };

        var onStart = function(msg) {
            var data = {
                message: {
                    id: socket.id,
                    target: msg || ''
                },
                cancel: false
            };
            that.emit('start', data);
            if (data.cancel) {
                return;
            }
            if (that._notificationStart) {
                that._notificationStart.publish(data.message);
            }
            that._notification.unsubscribe(data.message.id);
            that._notification.subscribe(data.message.id, data.message.target, function(message) {
                if (!socket.connected) {
                    return onStop();
                }
                var dataReceived = {
                    message: _.extend({ info: message.info }, data.message),
                    cancel: false
                };
                that.emit('receive', dataReceived);
                if (dataReceived.cancel) {
                    return;
                }
                socket.emit(that._eventReceive, dataReceived.message.info, dataReceived.message.target);
            });
        };

        var onSend = function(msg) {
            that.send(msg.info, msg.target);
        };

        socket.on(that._eventStart, onStart);

        socket.on(that._eventStop, onStop);

        socket.on(that._eventSend, onSend);

        socket.on('disconnect', onStop);

    });
};

/**
 * Default error handler. For internal use only
 * 
 * @param {Object} err
 */
Channel.prototype._errorHandler = function (err) {
    this.emit('error', err);
};

/**
 * Sends the information into the channel.
 * 
 * Possible signatures:
 * - `function(info)`
 * - `function(info, target)` 
 * 
 * @param {Object|Buffer} info - mandatory, data to be published
 * @param {String} target - optional, for routing messages (routingKey), ignored if `Notification({ type: 'fanout'})`. See https://www.rabbitmq.com/tutorials/amqp-concepts.html for details.
 */
Channel.prototype.send = function (info, target) {
    var that = this;
    var data = {
        message: {
            info: info,
            target: target || ''
        },
        cancel: false
    };
    that.emit('send', data);
    if (data.cancel) {
        return;
    }
    that._notification.publish(data.message, data.message.target);
};

module.exports = Channel;
