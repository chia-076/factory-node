'use strict';

var _ = require('lodash');

var DEFAULT_TTL = 5 * 60;

/**
 * Default cache client implementation
 * @constructor
 */
var VoidCacheClient = function(useMemory) {
    this.useMemory = useMemory;
    this.storage = {};

};

/**
 * Sets a value to the cache;
 * @param {String} key
 * @param {*} value
 * @param {Number} ttl
 * @param {Function} callback
 */
VoidCacheClient.prototype.set = function(key, value, ttl, callback) {
    var that = this;
    if (_.isFunction(ttl)) {
        callback = ttl;
    }
    callback = callback || function () {};
    if (this.useMemory) {
        var timeout = (ttl || DEFAULT_TTL) * 1000;
        this.storage[key] = {};
        this.storage[key]['value'] = value;
        this.storage[key]['_expires'] = Date.now() + timeout;

//        setTimeout(function() {
//            delete that.storage[key];
//        }, timeout);
    }

    return callback(null);
};

/**
 * Gets a value from the cache;
 * @param {String} key
 * @param {Function} callback
 */
VoidCacheClient.prototype.get = function(key, callback) {
    callback = callback || function () {};
    if (this.useMemory) {
        var err = (!this.storage[key] ? new Error('undefined session') : null);

        if (!this.storage[key]) {
            return callback(null, null);
        }

        if (this.storage[key]['_expires'] && Date.now() < this.storage[key]['_expires']) {
            return callback(null, this.storage[key]['value']);
        } else {
            delete this.storage[key];
        }

    }
    return callback(null, null);
};

/**
 * Deletes a key from the cache
 * @param {String} key
 * @param {Boolean} isPattern - If true, all keys that matched key pattern will be deleted
 * @param {Function} callback
 */
VoidCacheClient.prototype.delete = function(key, isPattern, callback) {
    callback = callback || function () {};
    if (this.useMemory) {
        delete this.storage[key];
    }
    return callback(null);
};

module.exports = VoidCacheClient;
