'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var _ = require('lodash');
var amqplib = require('amqplib');
var Url = require('url');
var uuid = require('node-uuid');
var async = require('async');

/**
 * Notification component
 * 
 * Emits the following events:
 * - `connect` - after connection initialization
 * - `close` - after connection close, callback signature `function(error)`
 * - `error` - in case of any errors, callback signature `function(error)` 
 * - `subscribe` - after subscription, callback signature `function(name, routingKey, callback)`
 * - `unsubscribe` - after un-subscription, callback signature `function(name)` 
 * 
 * options.name (optional) - {String}, name of the component, default value - "notification"
 * Internally used as a part of RabbitMQ exchange name, i.e. [exchange name] = options.prefix + '.' + options.name
 * 
 * options.prefix (optional) - {String}, prefix for naming, default value - "default"
 * Normally in CF environment this should be [local_name_prefix], for security reasons. 
 * Internally used as a part of RabbitMQ exchange name, i.e. [exchange name] = options.prefix + '.' + options.name
 * Internally used as a part of RabbitMQ queues names, i.e. [queue name] = options.prefix + '.' + [queue guid/name]
 * 
 * options.url (optional) - {String|Object|Url}, connection url to RabbitMQ server, default value - "amqp://localhost"
 * For detailed information see http://www.rabbitmq.com/uri-spec.html .
 * It is possible to ignore all connection parameters, set `options.disconnected = true` and manually call `Notification.connect(url, options)` later.
 * 
 * options.connection (optional) - {Object}, connection parameters to RabbitMQ server
 * For detailed documentation see http://www.squaremobius.net/amqp.node/doc/channel_api.html (connect section). 
 * It is possible to ignore all connection parameters, set `options.disconnected = true` and manually call `Notification.connect(url, options)` later.
 *
 * options.disconnected (optional) - {Boolean}, if set - the connect method is not called automatically, , default value - "false" 
 * If `options.disconnected = true` - it is necessary to call `Notification.connect(options)` manually later.
 * 
 * options.type (optional) - {String}, RabbitMQ exchange type, default value - "fanout"
 * For detailed documentation see https://www.rabbitmq.com/tutorials/amqp-concepts.html .
 * It is necessary to set `options.type = 'direct'` (or `options.type = 'topic'`) if you are planning to use "routing keys"
 * 
 * options.durable (optional) - {Boolean}, RabbitMQ durability, default value - "false"
 * For detailed documentation see https://www.rabbitmq.com/tutorials/amqp-concepts.html .
 * 
 * options.binary (optional) - {Boolean}, if set - all subscriptions receive Buffer instead of parsed JSON, default value - "false"
 *
 * options.confirm (optional) - {Boolean}, if not set - the publishing callback will not be called, default value - "false"
 * It is necessary to set `options.confirm = true` if you are planning to use callback in `Notification.publish(data, routingKey, callback)`
 *
 * options.distributed (optional) - {Boolean}, if set - notifications will be distributed among subscribers, default value - "false"
 * In this mode one notification will be delivered to one subscriber only, and load will be distributed using round-robin algorithm.
 * This mode useful for working queues, but not for publisher/subscriber model.
 * 
 * options.reconnectErrors (optional) - {Boolean}, if set - reconnect errors will be emitted, default value - "false"
 * 
 * options.owner (optional) - {Boolean}, if set - the RabbitMQ exchange will be deleted (if exists) before initialization, default value - "false"
 * It is necessary to set `options.owner = true` if you are planning to change existing settings for RabbitMQ exchange.
 * 
 * @param {Object} options - optional parameter
 */
var Notification = function (options) {
    Notification.super_.call(this);

    options = options || {};

    this._name = options.name || 'notification'; 
    this._type = options.type || 'fanout';
    this._url = options.url || 'amqp://localhost';
    this._prefix = options.prefix || 'default';
    this._exchange = this._prefix + '.' + this._name;
    this._binary = !!options.binary;
    this._confirm = !!options.confirm;
    this._durable = !!options.durable;
    this._distributed = !!options.distributed;
    this._reconnectErrors = !!options.reconnectErrors;
    this._owner = !!options.owner;
    this._options = options.connection;
    this._connected = false;
    this._connection = null;
    this._channel = null;
    this._tags = {};
    this._clearBuffer();

    if (!options.disconnected) {
        this.connect();
    }
};

util.inherits(Notification, EventEmitter);

/**
 * Default error handler. For internal use only
 * 
 * @param {Object} err
 */
Notification.prototype._errorHandler = function (err) {
    if (!err || (!this._reconnectErrors && err.code === 'ECONNRESET')) {
        return;
    }
    if (this._owner && !this._connected && (err.code === 'ECONNRESET' || err.code === 404)) {
        return; // Workaround for RabbitMQ version < 3.2
    }
    this.emit('error', err);
};

/**
 * Clears internal publish/subscribe buffer. For internal use only
 * 
 */
Notification.prototype._clearBuffer = function () {
    this._buffer = {
        publications: [],
        callbacks: [],
        subscriptions: {}
    };
};

/**
 * Applies internal publish/subscribe buffer. For internal use only
 * 
 */
Notification.prototype._applyBuffer = function () {
    var that = this;
    if (!that._connected) {
        return;
    }
    _.forEach(that._buffer.subscriptions, function(subscription){
        that.subscribe(subscription.name, subscription.routingKey, subscription.callback);
    });

    _.forEach(that._buffer.callbacks, function(subscription){
        that.subscribe(subscription.name, subscription.routingKey, subscription.callback);
    });

    _.forEach(that._buffer.publications, function(publication){
        that.publish(publication.data, publication.routingKey, publication.callback);
    });

    that._clearBuffer();
};

/**
 * Creates unique name with configured prefix
 * 
 * @param {String} suffix - optional, if omitted then the guid is generated instead
 */
Notification.prototype.name = function (suffix) {
    suffix = suffix || uuid.v4();
    return this._prefix + '.' + suffix;
};

/**
 * Publishes the data.
 * 
 * Possible signatures:
 * - `function(data)`
 * - `function(data, routingKey)`
 * - `function(data, routingKey, callback)` 
 * 
 * @param {Object|Buffer} data - mandatory, data to be published
 * @param {String} routingKey - optional, ignored if `Notification({ type: 'fanout'})`. See https://www.rabbitmq.com/tutorials/amqp-concepts.html for details.
 * @param {Function} callback - optional, callback function with signature `function(error)`. Will be called after publishing if `Notification({ confirm: true})`.
 */
Notification.prototype.publish = function (data, routingKey, callback) {
    var that = this;
    routingKey = routingKey || '';
    if (!that._connected) {
        that._buffer.publications.push({
            data: data,
            routingKey: routingKey,
            callback: callback
        });
        return;
    }
    var msg = data;
    if (!(data instanceof Buffer)) {
        msg = new Buffer(JSON.stringify(data));
    }
    try {
        that._channel.publish(that._exchange, routingKey, msg, { persistent: that._durable }, callback);
    } catch (err) {
        that.emit('error', err);
    }
};

/**
 * Subscribes for notifications.
 * 
 * Possible signatures:
 * - `function(callback)`
 * - `function(name, callback)`
 * - `function(name, routingKey, callback)`
 * 
 * `callback` signatures:
 * - `function(data)` - no ack required
 * - `function(data, ack)` - ack required for asynchronous processing, call `ack()` for completion
 * 
 * `ack` signatures (see https://github.com/postwait/node-amqp#queueshiftreject-requeue):
 * - `function()` - for successful acknowledgment
 * - `function(reject)` - for rejection
 * - `function(reject, requeue)` - for rejection with requeue
 * 
 * If `Notification({ distributed: true})` the `name` parameter is mandatory and points to the specific working queue.
 * In this mode one notification will be delivered to one subscriber only, and load will be distributed using round-robin algorithm.
 * 
 * @param {String} name - optional, should be provided if `Notification({ distributed: true})` or if you are planning to use `Notification.unsubscribe(name)`
 * @param {String|Array} routingKey - optional, ignored if `Notification({ type: 'fanout'})`. See https://www.rabbitmq.com/tutorials/amqp-concepts.html for details.
 * @param {Function} callback - mandatory, callback function for notification processing.
 */
Notification.prototype.subscribe = function (name, routingKey, callback) {
    var that = this;
    if (typeof name === 'function') {
        callback = name;
        name = '';
        routingKey = '';
    } else if (typeof routingKey === 'function') {
        callback = routingKey;
        routingKey = '';
    }
    var subscription = {};
    if (!that._connected) {
        subscription = {
            name: name,
            routingKey: routingKey,
            callback: callback
        };
        if (name) {
            that._buffer.subscriptions[name] = subscription;
        } else {
            that._buffer.callbacks.push(subscription);
        }
        return;
    }
    var clearTimer = function() {
        if (subscription.subscribeTimer) {
            clearTimeout(subscription.subscribeTimer);
            subscription.subscribeTimer = null;
        }
    };
    var errorHandler = function(err) {
        if (name && subscription && subscription.cancel) {
            clearTimer();
            delete that._tags[name];
        }
    };
    if (name) {
        subscription = that._tags[name];
        if (subscription) {
            if (subscription.cancel) {
                clearTimer();
                subscription.subscribeTimer = setTimeout(function() {
                    subscription.subscribeTimer = null;
                    that.subscribe(name, routingKey, callback);
                }, 500);
            }
            return;
        }
        subscription = {};
        that._tags[name] = subscription;
    }

    that._channel.assertQueue(that.name((that._distributed) ? (name) : ('')), {
        exclusive: !that._distributed, 
        durable: that._durable,
        autoDelete: true
    }).then(function(q) {
        subscription.queue = q.queue;
        var routingKeys = routingKey;
        if (!util.isArray(routingKeys)) {
            routingKeys = [routingKeys];
        }
        async.series(_.map(routingKeys, function(key) { 
            return function(next) {
                that._channel.bindQueue(q.queue, that._exchange, key).then(function() {
                    next();
                }).catch(next);
            };
        }), function() {
            var parse = function(msg) {
                return ((that._binary) ? (msg.content) : (JSON.parse(msg.content.toString())));
            };
            var ackCallback = function(msg) {
                callback(parse(msg));
            };
            var queueOptions = { 
                noAck: callback.length <= 1, 
                consumerTag: uuid.v4()
            };
            if (!queueOptions.noAck) {
                ackCallback = function(msg) {
                    callback(parse(msg), function(reject, requeue) {
                        if (reject) {
                            that._channel.reject(requeue);
                        } else {
                            that._channel.ack(msg);
                        }
                    });
                };
            }
            that._channel.consume(q.queue, ackCallback, queueOptions).then(function() {
                if (!name) {
                    return;
                }
                if (subscription.cancel) {
                    that._channel.cancel(queueOptions.consumerTag).then(function() {
                        that.emit('unsubscribe', name);
                    });
                    delete that._tags[name];
                    return;
                }
                subscription.tag = queueOptions.consumerTag;
                that.emit('subscribe', name, routingKey, callback);
            }).catch(errorHandler);
        });
    }).catch(errorHandler);
};

/**
 * Unsubscribes from notifications.
 * 
 * @param {String} name - mandatory, the name passed to `Notification.subscribe(name, routingKey, callback)`
 */
Notification.prototype.unsubscribe = function (name) {
    var that = this;
    if (!that._connected) {
        delete that._buffer.subscriptions[name];
        return;
    }
    var subscription = that._tags[name];
    if (!subscription) {
        return;
    }
    if (!subscription.tag || !subscription.queue) {
        if (subscription.subscribeTimer) {
            clearTimeout(subscription.subscribeTimer);
            subscription.subscribeTimer = null;
        }
        subscription.cancel = true;
        return;
    }
    that._channel.cancel(subscription.tag).then(function() {
        that.emit('unsubscribe', name);
    });
    delete that._tags[name];
};

/**
 * Correctly finalizes all external resources.
 * 
 */
Notification.prototype.close = function () {
    var that = this;
    if (!that._connected) {
        return;
    }
    var connection = that._connection;
    var closeConnection = function(err) {
        connection.close().then(function(){
            that.emit('close', err);
        }).catch(function(err) {
            that.emit('close', err);
        });
    };
    that._channel.close().then(closeConnection).catch(closeConnection);

    //that._channel.removeAllListeners();
    //that._connection.removeAllListeners();

    that._clearBuffer();

    that._tags = {};
    that._channel = null;
    that._connection = null;
    that._connected = false;
};

/**
 * Manually connects to RabbitMQ server.
 * 
 * For detailed information about `url` parameter see http://www.rabbitmq.com/uri-spec.html .
 * For detailed documentation about `options` parameter see http://www.squaremobius.net/amqp.node/doc/channel_api.html (connect section). 
 * 
 * Will do nothing if already connected.
 * Normally, should be used if it is important to delay the connection with `Notification({ disconnected: true})`.
 * Automatically called during component initialization with `Notification({ disconnected: false})`.
 * 
 * @param {String|Object|Url} url - optional, if omitted - will use `options.url` (if provided) from `Notification(options)`.
 * @param {Object} options - optional, if omitted - will use `options.connection` (if provided) from `Notification(options)`.
 */
Notification.prototype.connect = function (url, options) {
    var that = this;
    if (that._connected) {
        return;
    }
    var errorHandler = that._errorHandler.bind(that);
    var createChannel = ((that._confirm) ? ('createConfirmChannel') : ('createChannel'));
    url = url || that._url;
    options = options || that._options;
    url = Url.parse(url, true);
    // Workaround for amqplib (it doesn't recognize user names with ':' symbol inside)
    if (url.auth) {
        var auth = url.auth.split(':');
        if (auth.length > 2) {
            var pass = auth.pop(); 
            var user = auth.join(':');
            url.auth = new String (url.auth);
            url.auth.split = function() {
                return [user, pass];
            };
        }
    }
    amqplib.connect(url, options).then(function(conn) {
        that._connection = conn;
        that._connection.on('error', errorHandler);
        return that._connection[createChannel]();
    }).then(function(ch) {
        that._channel = ch;
        that._channel.on('error', errorHandler);
        if (that._owner) {
            return that._channel.deleteExchange(that._exchange).catch(function(err) {
                // Hack for RabbitMQ version < 3.2
                that._channel.removeListener('error', errorHandler);
                that._channel = null;
                return that._connection[createChannel]().then(function(ch) {
                    that._channel = ch;
                    that._channel.on('error', errorHandler);
                });
            });
        }
        return this;
    }).then(function() {
        that._channel.prefetch(1);
        return that._channel.assertExchange(that._exchange, that._type, { durable : that._durable, autoDelete: false });
    }).then(function() {
        that._connected = true;
        that.emit('connect');
        that._applyBuffer();
    });
};

/**
 * Returns the connection state.
 * 
 *  @return {Boolean}
 */
Notification.prototype.connected = function () {
    return this._connected;
};

module.exports = Notification;
