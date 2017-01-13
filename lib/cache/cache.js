'use strict';

var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;

var client = null;
var failOverClient = null;
var defaultClient = null;

var failOverMode = false;

var DEFAULT_TTL = 5 * 60;

var cacheClients = {};

var cache = Object.create(new EventEmitter());

/**
 * Mixing class for slow request processing functionality
 * 
 * options.requestTimeout {Number} - request timeout in milliseconds, default - 1000
 * options.slowRequestCount {Number} - the retry count for slow cache requests, default - 10
 * options.slowRequestFailoverTimeout {Number} - the fail over timeout for slow cache requests in milliseconds, default - (60 * 1000)
 * 
 * @param {Object} options
 * @returns {Object}
 */
var requestTimeoutMixing = function(options) {
    options = options || {};

    var requestTimeout = options.requestTimeout || 1000;
    var slowRequestCount = options.slowRequestCount || 10;
    var slowRequestFailoverTimeout = options.slowRequestFailoverTimeout || 60 * 1000;

    var Stats = function() {
        this.stamp = process.uptime();
        this.count = 0;
    };

    var retryCount = 0, failOverMode = false;
    var requestStats = {
        stable: new Stats(),
        draft: new Stats()
    };

    var loadBalancer = options.loadBalancer ||
    /**
     * Load balancer
     * 
     * @param {Number} rate - average number of requests per 1 second
     * @param {Number} timeout - default cache request timeout for single request ("options.requestTimeout") 
     * @returns {Number} - cache request timeout
     */
    function (rate, timeout) {
        if (rate <= 0) {
            return timeout;
        }
        var factor = Math.log(rate);
        if (factor < 1) {
            return timeout;
        }
        return Math.floor(factor * timeout);
    };

    return {

        /**
         * Gets the max request timeout for cache in milliseconds
         */
        getRequestTimeout: function () {
            return requestTimeout;
        },

        /**
         * Sets the max request timeout for cache in milliseconds, default - 1000
         * @param {Number} timeout
         */
        setRequestTimeout: function (timeout) {
            if (_.isNumber(timeout)) {
                requestTimeout = timeout;
            }
        },

        /**
         * Gets the retry count for slow cache requests
         */
        getSlowRequestCount: function () {
            return slowRequestCount;
        },

        /**
         * Sets the retry count for slow cache requests
         * @param {Number} count
         */
        setSlowRequestCount: function (count) {
            if (_.isNumber(count) && count > 0) {
                slowRequestCount = count;
            }
        },

        /**
         * Gets the fail over timeout for slow cache requests in milliseconds
         */
        getSlowRequestFailoverTimeout: function () {
            return slowRequestFailoverTimeout;
        },

        /**
         * Sets the fail over timeout for slow cache requests in milliseconds, default - 60 * 1000;
         * @param {Number} timeout
         */
        setSlowRequestFailoverTimeout: function (timeout) {
            if (_.isNumber(timeout)) {
                slowRequestFailoverTimeout = timeout;
            }
        },

        /**
         * Gets the load balancer function
         *  signature "function (rate, timeout)"
         *      param {Number} rate - average number of requests per 1 second
         *      param {Number} timeout - default cache request timeout for single request ("options.requestTimeout") 
         *      returns {Number} - cache request timeout
         * 
         */
        getLoadBalancer: function () {
            return loadBalancer;
        },

        /**
         * Sets the load balancer function
         *  signature "function (rate, timeout)"
         *      param {Number} rate - average number of requests per 1 second
         *      param {Number} timeout - default cache request timeout for single request ("options.requestTimeout") 
         *      returns {Number} - cache request timeout
         *
         * @param {Function} balancer
         */
        setLoadBalancer: function (balancer) {
            if (_.isFunction(balancer)) {
                loadBalancer = balancer;
            }
        },

        /**
         * Wraps the cache request with expiration timeout
         * For internal use only
         * @param {Function} handler
         * @param {Function} callback
         * @param {Function} errorHandler
         */
        _wrapWithTimeout: function(handler, callback, errorHandler) {
            var that = this;
            if (!callback) {
                return handler(function() {});
            }
            if (requestStats.draft.stamp < process.uptime()) {
                requestStats.stable = requestStats.draft;
                requestStats.draft = new Stats();
            } else {
                ++requestStats.draft.count;
            }
            var processed = false, timeout = null;
            handler(function() {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                if (processed) {
                    return;
                }
                processed = true;
                retryCount = 0;
                callback.apply(null, arguments);
            });
            if (requestTimeout > 0) {
                timeout = setTimeout(function() {
                    timeout = null;
                    if (processed) {
                        return;
                    }
                    processed = true;
                    if (!failOverMode && ++retryCount >= slowRequestCount) {
                        failOverMode = true;
                        that.emit('slowRequestFailoverBegin');
                        setTimeout(function() {
                            if (failOverMode) {
                                retryCount = 0;
                                failOverMode = false;
                                that.emit('slowRequestFailoverEnd');
                            }
                        }, slowRequestFailoverTimeout);
                    }
                    if (errorHandler) {
                        return errorHandler(callback);
                    }
                    callback();
                }, loadBalancer(requestStats.stable.count, requestTimeout));
            }
        }
    };
};

module.exports = _.assign(cache, requestTimeoutMixing(), {
    /**
     * Registers a cache client
     * @param {String} name
     * @param {Object} buildCacheClient
     */
    registerCacheClient: function (name, buildCacheClient) {
        cacheClients[name] = buildCacheClient;
    },

    /**
     * Setups fallback for the cache
     */
    setupDegradation: function () {
        var that = this;

        var onConnect = function () {
            that.emit('clientReconnect');
            client = defaultClient;
            failOverMode = false;
        };

        var onError = function (err) {

            if (failOverMode) {
                return;
            }

            that.emit('clientError', err);
            client = failOverClient;
            failOverMode = true;

        };

        that.on('slowRequestFailoverBegin', onError.bind(that, new Error('The data cache is slow to respond')));
        that.on('slowRequestFailoverEnd', onConnect);

        if (_.isFunction(defaultClient.setupDegradation)) {
            defaultClient.setupDegradation(onConnect, onError);
        }
    },

    /**
     * Sets a default client from the list of registered cache clients
     * @param {String} type
     */
    setClient: function (type) {
        if (cacheClients[type] === undefined || !_.isFunction(cacheClients[type])) {
            return null;
        }

        client = cacheClients[type]();
        defaultClient = client;

        this.setupDegradation();
    },

    /**
     * Sets fallback cache client
     * @param {String} type
     */
    setFailOverClient: function (type) {
        if (cacheClients[type] === undefined || !_.isFunction(cacheClients[type])) {
            return null;
        }

        failOverClient = cacheClients[type]();
    },

    /**
     * Sets a value to the cache;
     * @param {String} key
     * @param {*} value
     * @param {Number} ttl
     * @param {Function} callback
     */
    set: function (key, value, ttl, callback) {
        if (_.isFunction(ttl)) {
            callback = ttl;
            ttl = DEFAULT_TTL;
        }

        if (!_.isFunction(callback)) {
           callback = function(){};
        }

        ttl = _.isUndefined(ttl) ? DEFAULT_TTL : ttl;
        callback = callback || function () {};

        this._wrapWithTimeout(function(done) {
            client.set(key, value, ttl, done);
        }, callback);
    },

    /**
     * Gets a value from the cache;
     * @param {String} key
     * @param {Function} callback
     */
    get: function (key, callback) {
        this._wrapWithTimeout(function(done) {
            client.get(key, done);
        }, callback);
    },

    /**
     * Deletes a key from the cache
     * @param {String} key
     * @param {Boolean} isPattern - If true, all keys that matched key pattern will be deleted
     * @param {Function} callback
     */
    delete: function (key, isPattern, callback) {
        if (!_.isFunction(callback)) {
            callback = function(){};
            isPattern = _.isBoolean(isPattern) ? isPattern : false;
        }

        this._wrapWithTimeout(function(done) {
            client.delete(key, isPattern, done);
        }, callback);
    },


    /**
     * Wraps a function with cache
     * @param {String} key
     * @param {Function} action
     * @returns {Function}
     */
    wrapWithCache: function (key, ttl, action) {
        var client = this;

        if (_.isFunction(ttl)) {
            action = ttl;
            ttl = DEFAULT_TTL;
        }

        return function () {
            var that = this;
            var _arguments = _.toArray(arguments);
            var _key = key;

            //remove standart callback from arguments
            var done = _arguments.pop();

            //process cache key func
            if (_.isFunction(_key)) {
                _key = _key.apply(this, arguments);
            }

            client.get(_key, function (err, result) {
                if (err) {
                    return done(err);
                }

                if (result) {
                    return done(null, result);
                }

                //create new custom callback with default cache setter
                var callback = function (err, result) {
                    //if there isn't error set new value to cache
                    if (!err) {
                        client.set(_key, result, ttl);
                    }

                    //invoke default callback
                    done.apply(this, arguments);
                };

                //insert out custom callback instead of default callback
                _arguments.push(callback);

                //if there isn't values in cache - invoke action
                action.apply(that, _arguments);
            });
        };
    }
});

module.exports.requestTimeoutMixing = requestTimeoutMixing;
