'use strict';

var redis = require('redis'),
    _ = require('lodash'),
    async = require('async');

/**
 * Redis cache client implementation
 * @param {Number} port
 * @param {String} host
 * @param {Object} options
 * @constructor
 */
var RedisCacheClient = function (port, host, options) {
    var that = this;
    this.client = redis.createClient(port, host, options);

    this.client.on('ready', function () {
        if (options.db) {
            that.client.select(Number(options.db), function (err) {
                if (!err) {
                    that.client.emit('redisDbSelected');
                }
            });
        }
    });
};

/**
 * Authorization
 * @param {String} password
 * @param {Function} callback
 */
RedisCacheClient.prototype.auth = function (password, callback) {
    this.client.auth(password, callback);
};

/**
 * Set params
 * @param {String} key
 * @param {String] value
 * @param {String} ttl
 * @param {Function} callback
 */
RedisCacheClient.prototype.set = function (key, value, ttl, callback) {

    if (_.isFunction(ttl)) {
        callback = ttl;
        ttl = false;
    }

    callback = callback || function () {};

    if (!_.isString(value)) {
        value = JSON.stringify(value);
    }

    if (ttl) {
        this.client.setex(key, ttl, value, callback);
    } else {
        this.client.set(key, value, callback);
    }
};

/**
 * Get value by key
 * @param {String} key
 * @param {Function] callback
 */
RedisCacheClient.prototype.get = function (key, callback) {
    this.client.get(key, function (err, result) {
        if (err) {
            return callback(err);
        }

        if (_.isString(result)) {
            try {
                result = JSON.parse(result);
            } catch (e) {}
        }
        callback(null, result);
    });
};

/**
 * Delete value
 * @param {String} key
 * @param {Boolean} isPattern
 * @param {function} callback
 */
RedisCacheClient.prototype.delete = function (key, isPattern, callback) {
    var that = this;

    if (isPattern) {
        this.client.keys(key, function (err, result) {
            if (err) {
                return callback(err);
            }

            if (_.isString(result)) {
                try {
                    result = JSON.parse(result);
                } catch (e) {}
            }

            async.each(result, that.client.del.bind(that.client), callback);
        });
    } else {
        this.client.del(key, callback);
    }
};

RedisCacheClient.prototype.setupDegradation = function (onConnect, onError) {
    var that = this;
    var isErrorHappened = false;

    this.client.on('error', function (err) {
        if (!isErrorHappened) {
            isErrorHappened = true;
            onError(err);
            that.client.once('connect', function () {
                onConnect();
                isErrorHappened = false;
            });
        }
    });
};

module.exports = RedisCacheClient;