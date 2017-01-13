'use strict';

var _ = require('lodash');
var util = require('util');
var queryString = require('querystring');
var passport = require('passport');
var cache = require('../cache/cache');
var httpProxy = require('http-proxy');
var url = require('url');

var proxiedServices = {};

/**
 * trying to get user from request object or
 * from session of from passport object
 *
 * @param  {IncomingMessage} req
 * @return {Object}
 */
var getUser = function (req) {
    if (req.user) {
        return req.user;
    } else if (req.session.user) {
        return req.session.user;
    } else if (req.session[passport._key].user) {
        return req.session[passport._key].user;
    } else {
        return null;
    }
};

/**
 * @param app - Express application
 * @param {String} name - Name of the service proxy.
 * @param {String|Function} serviceUrl - Service url string to parse or function to obtain proxy params dynamically.
 * @param {String} basePath - Base path of proxy url.
 * @param {Boolean} [options.cache] - Enable caching for proxy.
 * @param {Number} [options.cacheControlMaxAge] - If set - enable "Cache-Control" response header with the "max-age" parameter set to its value (in seconds).
 * @param {Function} [options.requestCacheFilterFunction] - Function to filter requests for caching. Should return true/false or directrly use res, next to handle proxy behaivor.
 * @param {Boolean} [options.ttl] - TTL in seconds of cached data.
 * @param {Boolean} [options.authorize] - Replace authorization header, default = true.
 * @param {Object} [options.headers] - Additional request headers.
 * @param {Object} [options.query] - Additional request query parameters.
 * @param {Object} [options.body] - Additional request body parameters.
 * @constructor
 */
var ServiceProxy = function (app, name, serviceUrl, basePath, options) {
    this.app = app;
    this.name = name;
    this.serviceUrl = serviceUrl;
    this.basePath = basePath;
    this.cache = options.cache;
    this.ttl = options.ttl;
    this.cacheControlMaxAge = options.cacheControlMaxAge;
    this.authorize = (options.authorize !== false);
    this.headers = options.headers;
    this.query = options.query;
    this.body = options.body;
    this.middlewares = [];
    this.requestCacheFilterFunction = options.requestCacheFilterFunction;

    this._initProxy();
    this._initRoutes();
    this._initCache();
};

/**
 * Adds middleware for the request pre-processing
 * @param fn
 */
ServiceProxy.prototype.addMiddleware = function (fn) {
    if (typeof fn === 'function') {
        this.middlewares.push(fn);
    }
};

/**
 * Initializes proxy
 * @private
 */
ServiceProxy.prototype._initProxy = function () {
    this.proxy = httpProxy.createProxyServer(_.isFunction(this.serviceUrl) ? {} : {
        target: this.serviceUrl
    });

    this.proxy.on('error', function (err, req, res) {
        if (res && !res.headersSent) {
            res.send(503);
        }
    });
};

/**
 * Initializes application routes for proxy
* @private
 */
ServiceProxy.prototype._initRoutes = function () {
    var that = this;

    this.app.all(
            this.basePath + '/*',
        require('connect-restreamer')(),
        this._applyMiddleware.bind(this),
        this._processRequest.bind(this),
        this._checkCache.bind(this),
        this._proxyRequest.bind(this)
    );
};

/**
 * Adds proxy response handler for saving data into cache
 * @private
 */
ServiceProxy.prototype._initCache = function () {
    var that = this;

    if (this.cache) {
        this.proxy.on('proxyRes', function (proxyRes, req, res) {
            var data = '';

            if (_.isFunction(that.requestCacheFilterFunction) && !that.requestCacheFilterFunction.call(that, req, res)) {
                return;
            }

            if (proxyRes.statusCode === 200) {
                proxyRes.on('data', onData);

                proxyRes.on('end', onEnd);

                proxyRes.on('error', clear);
            }

            function onData(chunk) {
                data += chunk;
            }

            function onEnd() {
                var key = req.url;

                cache.set(key, data, that.ttl);

                clear();
            }

            function clear() {
                proxyRes.removeListener('data', onData);
                proxyRes.removeListener('end', onEnd);
                proxyRes.removeListener('error', clear);
            }
        });
    }
};

/**
 * Applies middlewares
 * @private
 */
ServiceProxy.prototype._applyMiddleware = function (req, res, next) {
    var stack = this.middlewares;

    var walkStack = function (i, err) {

        if (err) {
            return next(err);
        }

        if (i >= stack.length) {
            return next();
        }

        stack[i](req, res, walkStack.bind(null, i + 1));

    };

    walkStack(0);
};

/**
 * Checks if request can be handled by cache
 * @private
 */
ServiceProxy.prototype._checkCache = function (req, res, next) {
    var that = this;

    //cache only if cache is enabled param and only GET requests
    if (req.method !== 'GET' || !this.cache) {
        return next();
    }

    if (_.isFunction(this.requestCacheFilterFunction) && !this.requestCacheFilterFunction.call(this, req, res, next)) {
        return next();
    }

    var key = req.url;

    cache.get(key, function (err, result) {
        if (err) {
            return next();
        }

        if (result) {
            if (that.cacheControlMaxAge) {
                res.set({'Cache-Control': 'max-age=' + that.cacheControlMaxAge});
            }

            return res.send(result);
        }

        next();
    });
};

/**
 * Proxing request
 * @private
 */
ServiceProxy.prototype._proxyRequest = function (req, res) {
    this.proxy.web(req, res, _.isFunction(this.serviceUrl) ? this.serviceUrl(req, res) : null);
};

/**
 * Processing the request, checks auth, adding necessary headers.
 * @private
 */
ServiceProxy.prototype._processRequest = function (req, res, next) {
    var apiUrl = encodeURI(req.params[0]);

    if (this.headers) {
        if (!req.headers) {
            req.headers = {};
        }
        _.extend(req.headers, this.headers);
    }
    if (this.query) {
        if (!req.query) {
            req.query = {};
        }
        _.extend(req.query, this.query);
    }
    if (this.body && req.body) {
        _.extend(req.body, this.body);
        req.headers['content-length'] = JSON.stringify(req.body).length;
    }

    if (this.authorize) {
        var user = getUser(req);
        if (!user) {
            return res.json(401, {error: 'user is unauthorized'});
        }
        req.headers.Authorization = 'Bearer ' + user.accessToken;
    }

    var query = queryString.stringify(req.query);

    var options = null, targetUrl = this.serviceUrl;
    if (_.isFunction(this.serviceUrl)) {
        options = this.serviceUrl(req, res);
        targetUrl = options && options.target;
        apiUrl = '';
    }

    req.url = (query) ? util.format('/%s?%s', apiUrl, query) : '/' + apiUrl;

    req.headers.host = targetUrl && url.parse(targetUrl).host || '';

    next();
};

/**
 * @param app - Express application.
 * @param {String} name - Name of the service proxy.
 * @param {String|Function} serviceUrl - Service url string to parse or function to obtain proxy params dynamically.
 * @param {String} [options.basePath] - Base path of proxy url.
 * @param {Boolean} [options.cache] - Enable caching for proxy.
 * @param {Number} [options.cacheControlMaxAge] - If set - enable "Cache-Control" response header with the "max-age" parameter set to its value (in seconds).
 * @param {Function} [options.requestCacheFilterFunction] - Function to filter requests for caching. Should return true/false or directrly use res, next to handle proxy behaivor
 * @param {Number} [options.ttl] - TTL in seconds of cached data.
 * @param {Boolean} [options.authorize] - Replace authorization header, default = true.
 * @param {Object} [options.headers] - Additional request headers.
 * @param {Object} [options.query] - Additional request query parameters.
 * @param {Object} [options.body] - Additional request body parameters.
 * @return {ServiceProxy} - Instance of service proxy class.
 */
exports.createProxyInstance = function (app, name, serviceUrl, options) {
    if (!app || !name || !serviceUrl) {
        throw new Error('App, name and service url are mandatory!');
    }

    if (proxiedServices[name] && proxiedServices[name].proxy) {
        throw new Error('Proxy for service ' + name + ' already exist');
    }

    proxiedServices[name] = {};
    var opts = options || {};

    var basePath = opts.basePath || '/services/' + name;

    if (_.last(basePath) === '/') {
        basePath = basePath.slice(0, -1);
    }

    if (_.first(basePath) !== '/') {
        basePath = '/'.concat(basePath);
    }

    if (opts.requestCacheFilterFunction && !_.isFunction(opts.requestCacheFilterFunction)) {
        throw new Error('requestCacheFilterFunction should be a function!');
    }

    if (opts.ttl && !_.isNumber(opts.ttl)) {
        throw new Error('ttl should be a number!');
    }

    var cache = !!opts.cache;

    var serviceProxy = new ServiceProxy(app, name, serviceUrl, basePath, {
        cache: cache,
        ttl: opts.ttl,
        cacheControlMaxAge: opts.cacheControlMaxAge,
        requestCacheFilterFunction: opts.requestCacheFilterFunction,
        authorize: opts.authorize,
        headers: opts.headers,
        query: opts.query,
        body: opts.body
    });

    //add service proxy instance to global storage
    proxiedServices[name].proxy = serviceProxy;

    return serviceProxy;
};

//Methods for compatibility with serviceProxy module in krot v.1.5.0
exports.addProxiedServices = function (services) {
    _.extend(proxiedServices, services);
};

exports.removeProxiedService = function (serviceName) {
    delete proxiedServices[serviceName];
};

exports.createProxy = function (app) {
    _.each(Object.keys(proxiedServices), function (serviceName) {
        var serviceOpts = proxiedServices[serviceName], serviceUrl;

        //service proxy already exist
        if (serviceOpts.proxy) {
            return;
        }

        if (!serviceOpts.href && !serviceOpts.host) {
            throw new Error('Service host is required');
        }

        serviceUrl = serviceOpts.href ? serviceOpts.href : url.format({
            protocol: serviceOpts.protocol || 'http',
            hostname: serviceOpts.host.replace(/(http:\/\/|https:\/\/|\/\/)/g, ''),
            pathname: serviceOpts.path,
            port: (serviceOpts.port) ? (serviceOpts.port) : ((serviceOpts.protocol === 'https') ? (443) : (80))
        });

        exports.createProxyInstance(app, serviceName, serviceUrl, serviceOpts);
    });
};

exports.addMiddleware = function (serviceName, fn) {
    if (!proxiedServices[serviceName]) {
        throw new Error('there is no such service ' + serviceName);
    }

    proxiedServices[serviceName].proxy.addMiddleware(fn);
};

exports.getProxyInstance = function (serviceName) {
    return proxiedServices[serviceName] ? proxiedServices[serviceName].proxy : null;
};
