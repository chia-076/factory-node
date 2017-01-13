var Memcached = require('memcached');
var cache  = require('./cache');
var _ = require('lodash');
var util = require("util");
var VoidCacheClient = require('./clients/void');
var MemcachedCacheClient = require('./clients/memcached');

var oneDay = 86400;

/**
 * Return the `SessionClientStore` extending `connect`'s session Store.
 *
 * @param {object} session
 * @return {Function}
 * @api public
 */
module.exports.Session = function(session) {
    var Store = session.Store;

    /**
     * Initialize SessionClientStore with the given `options`.
     *
     * options.ttl - TTL for session in seconds (used if cookie.maxAge is not defined), default - one day
     *
     * @param {Object} options
     * @api public
     */
    function SessionClientStore(options) {

        options = options || {};
        Store.call(this, options);

        this.ttl = options.ttl || oneDay;
        this.client = null;
        this.defaultClient = null;
        this.failOverClient = null;
        this.defaultFailOverClient = null;
        this.failOverMode = false;
        this.isLazyFailOver = false;
        this.cacheClients = {};

        this._initFailOver();
    }

    util.inherits(SessionClientStore, Store);

    /**
     * Extends SessionClientStore with slow request processing functionality
     */
    _.assign(SessionClientStore.prototype, cache.requestTimeoutMixing({ requestTimeout: 5000, slowRequestCount: 2 }));

    /**
     * Initializes the default failover settings
     *
     * @api private
     */
    SessionClientStore.prototype._initFailOver = function() {
        this.registerCacheClient('_memory_store', function() {
            return new VoidCacheClient(true);
        });
        this.setFailOverClient('_memory_store');
    };

    /**
     * Gets the session key by the given `sid`.
     *
     * @param {String} sid
     * @api public
     */
    SessionClientStore.prototype.getKey = function getKey(sid) {
        return this.client._buildKey(sid);
    };


    /**
     * Attempt to fetch session by the given `sid`.
     *
     * @param {String} sid
     * @param {Function} fn
     * @api public
     */
    SessionClientStore.prototype.get = function(sid, fn) {
        var that = this;
        that._wrapWithTimeout(function(done) {
            that.client.get(sid, done);
        }, function(err, data) {
            if (err) {
                return fn(err, {});
            }
            try {
                if (!data) {
                    return fn();
                }
                if (typeof data === 'string') {
                    data = JSON.parse(data);
                }
                fn(null, data);
            } catch (e) {
                fn(e);
            }
        }, function(done) {
            if (that.failOverClient && !that.isLazyFailOver) {
                that.failOverClient.get(sid, done);
            }
        });
    };

    /**
     * Commit the given `sess` object associated with the given `sid`.
     *
     * @param {String} sid
     * @param {Session} sess
     * @param {Function} fn
     * @api public
     */
    SessionClientStore.prototype.set = function(sid, sess, fn) {
        var that = this;

        try {
            var ttl = that.ttl;
            if (sess.cookie && sess.cookie.maxAge && 'number' === typeof sess.cookie.maxAge) {
                ttl = (sess.cookie.maxAge / 1000) | 0;
            }

            var sess = JSON.stringify(sess);

            that._wrapWithTimeout(function(done) {
                that.client.set(sid, sess, ttl, done);
                if (that.failOverClient && !that.isLazyFailOver) {
                    that.failOverClient.set(sid, sess, ttl);
                }
            }, fn);

        } catch (err) {

            fn && fn(err);

        }
    };

    /**
     * Destroy the session associated with the given `sid`.
     *
     * @param {String} sid
     * @param {Function} fn
     * @api public
     */
    SessionClientStore.prototype.destroy = function(sid, fn) {
        var that = this;
        that._wrapWithTimeout(function(done) {
            that.client.delete(sid, done);
            if (that.failOverClient && !that.isLazyFailOver) {
                that.failOverClient.delete(sid);
            }
        }, fn);
    };

    /**
     * Registers cache client
     *
     * @param {String} name
     * @param {Function} buildCacheClient
     * @api public
     */
    SessionClientStore.prototype.registerCacheClient = function (name, buildCacheClient) {
        this.cacheClients[name] = buildCacheClient;
    };

    /**
     * Setups fallback for the cache
     */
    SessionClientStore.prototype.setupDegradation = function () {
        var that = this;

        var onConnect = function () {
            that.emit('clientReconnect');
            that.client = that.defaultClient;
            that.failOverClient = that.defaultFailOverClient;
            that.failOverMode = false;
        };

        var onError = function (err) {
            if (that.failOverMode) {
                return;
            }
            that.emit('clientError', err);
            that.client = that.defaultFailOverClient;
            that.failOverClient = that.defaultClient;
            that.failOverMode = true;
        };

        that.on('slowRequestFailoverBegin', onError.bind(that, new Error('The session cache is slow to respond')));
        that.on('slowRequestFailoverEnd', onConnect);

        if (_.isFunction(that.defaultClient.setupDegradation)) {
            that.defaultClient.setupDegradation(onConnect, onError);
        }
    };

    /**
     * Sets a default client from the list of registered cache clients
     * @param {String} type
     */
    SessionClientStore.prototype.setClient = function (type) {
        if (this.cacheClients[type] === undefined || !_.isFunction(this.cacheClients[type])) {
            return null;
        }

        this.client = this.cacheClients[type]();
        this.defaultClient = this.client;
        this.setupDegradation();
    };

    /**
     * Gets a default client from the list of registered cache clients
     * @param {String} type
     */
    SessionClientStore.prototype.getDefaultClient = function () {
        return  this.defaultClient;
    };

    /**
     * Sets fallback cache client
     * @param {String} type
     * @param {Boolean} lazy
     */
    SessionClientStore.prototype.setFailOverClient = function (type, lazy) {
        if (this.cacheClients[type] === undefined || !_.isFunction(this.cacheClients[type])) {
            return null;
        }
        this.isLazyFailOver = !!lazy;
        this.failOverClient = this.cacheClients[type]();
        this.defaultFailOverClient = this.failOverClient;
    };

    return SessionClientStore;
};

/**
 * Return the `MemcachedClientStore` extending `connect`'s session Store.
 *
 * @param {object} session
 * @return {Function}
 * @api public
 */
module.exports.MemcachedSession = function(session) {
    var Store = module.exports.Session(session);

    /**
     * Initialize MemcachedClientStore with the given `options`.
     *
     * options.ttl - TTL for session in seconds (used if cookie.maxAge is not defined), default - one day
     * options.hazelcastUrl - hazelcast url, default "127.0.0.1:11211"
     * options.hazelcastPrefix - hazelcast prefix, default ""
     *
     * @param {Object} options
     * @api public
     */
    function MemcachedClientStore(options) {

        options = options || {};
        Store.call(this, options);
        var prefix = options.hazelcastPrefix || '';

        if (!options.hazelcastUrl) {
            options.hazelcastUrl = '127.0.0.1:11211';
        }

        var that = this;
        this.registerCacheClient('memcached', function() {
            var cacheClient = new MemcachedCacheClient(options.hazelcastUrl, {
                keyPrefix: prefix,
                isGetUnsafe: true,
                ttl: that.ttl
            });
            return cacheClient;
        });

        this.setClient('memcached');

    }

    util.inherits(MemcachedClientStore, Store);

    return MemcachedClientStore;
};

 