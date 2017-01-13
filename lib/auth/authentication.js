'use strict';

var passport = require('passport'),
    url = require('url'),
    util = require('util'),
    querystring = require('querystring'),
    crypto = require('crypto'),
    _ = require('lodash'),
    httpRequest = require('request'),
    EventEmitter = require('events').EventEmitter;

var Strategy = require('./passport-uaa/strategy'),
    DynamicStrategy = require('./passport-uaa/dynamicStrategy'),
    unsecureUrl = require('./unsecureUrl');


exports.socketAuthorization = require('./socketAuthorization');
exports.Strategy = Strategy;

var getProtocol = function (request) {
    var isHttps = (request.connection.encrypted || request.headers['x-forwarded-proto'] === 'https');
    return isHttps ? 'https' : 'http';
};

var createUrl = function (request, path) {
    path = path || '';
    var headers = request.headers;

    return getProtocol(request) + '://' + headers.host + path;
};

var getExpirationDate = function(timeStamp) {
    timeStamp = Math.floor(timeStamp * AUTH_EXPIRE_FACTOR) * 1000;
    return Date.now() + timeStamp;
};


/**
 * create url for redirect after login
 * @param  {Object} request
 * @return {String}
 */
var createRedirectUrl = function (request) {
    var parsed = url.parse(request.url);
    if (parsed.protocol) {
        return request.url;
    }

    return createUrl(request, request.url);
};


/**
 * create an instanse of authentication provider
 *
 * @param {Object} app
 * @constructor
 */
var Authentication = function (app) {
    this.app = app;
    this.authOptions = {};
};

util.inherits(Authentication, EventEmitter);

exports.Authentication = Authentication;

Authentication.STRATEGY_NAME = 'uaa';

/**
 * default authentication verify function
 * @param  {String}   accessToken
 * @param  {String}   refreshToken
 * @param  {Object}   params
 * @param  {Object}   profile
 * @param  {Function} done
 */
Authentication.prototype.verifyAuth = function (accessToken, refreshToken, params, profile, done) {
    profile.accessToken = accessToken;
    profile.refreshToken = refreshToken;
    profile.expires_in = getExpirationDate(params.expires_in);
    profile.scope = params.scope;

    this.emit('successLogin', profile);
    done(null, profile);
};


/**
 * add unsecure url to url list
 * @param {String|Array} urls
 */
Authentication.prototype.addUnsecureUrl = function (urls) {
    unsecureUrl.add(urls);
};

/**
 * check if the url is unsecure
 * @param {String} url
 */
Authentication.prototype.checkUnsecureUrl = function (url) {
    return unsecureUrl.check(url);
};

/**
 * make routes for login logoutand auth/callback
 */
Authentication.prototype.makeRoutes = function () {
    var that = this;

    var makeCallbackUrl = function (request) {
        var options = that.getAuthOptions(request);
        var redirectUri = encodeURIComponent(request.query.redirect_uri || '/');
        return util.format('%s?redirect_uri=%s', options.callbackURL, redirectUri);
    };

    this.app.get('/login', function (request, response, next) {
        return passport.authenticate(Authentication.STRATEGY_NAME, {
            callbackURL: makeCallbackUrl(request)
        })(request, response, next);
    });

    this.app.get('/logout', function (request, response) {
        var options = that.getAuthOptions(request);

        logOutSession(request, response);

        var redirectUrl = encodeURIComponent(request.header('Referer') || createUrl(request));
        var redirectUri = util.format('%s/logout.do?redirect=%s', options.uaaUrl, redirectUrl);

        response.redirect(redirectUri);
    });

    this.app.get('/auth/callback', function (request, response, next) {
        return passport.authenticate(Authentication.STRATEGY_NAME, {
            callbackURL: makeCallbackUrl(request),
            successRedirect: request.query.redirect_uri,
            failureRedirect: '/'
        })(request, response, next);
    });
};

Authentication.prototype.setStrategy = function (Strategy) {
    this.Strategy = Strategy;
};

var logOutSession = function (request, response) {
    var session = request.session;
    if (session) {
        session.destroy();
    }
    response.clearCookie('connect.sid');
    if (_.isFunction(request.logOut)) {
        request.logOut();
    } else {
        request.user = null;
        delete request._passport.session.user;
    }
};

var checkSession = function (request, response, next) {
    if (!request.session) {
        return next('You have to add session middleware before auth!');
    }
    next();
};


var getAccessTokenUsingRefreshTokenFlow = function (authOptions, user, callback) {
    var authorization = new Buffer(authOptions.clientID + ':' + authOptions.clientSecret).toString('base64');
    var options = {
        'url': authOptions.uaaUrl + '/oauth/token',
        'headers': {
            'Accept': 'application/json',
            'Authorization': 'Basic ' + authorization
        },
        'form': {
            'refresh_token': user.refreshToken,
            'grant_type': 'refresh_token'
        }
    };

    httpRequest.post(options, function (error, response, body) {
        if (error || response.statusCode !== 200) {
            if (!error) {
                try {
                    body = JSON.parse(body);
                } catch (e) {}
            }

            return callback(error || body);
        }
        callback(null, body);
    });
};

var AUTH_EXPIRE_FACTOR = Number(process.env.AUTH_EXPIRE_FACTOR) || 0.7;

var checkExpires = function(expiresIn) {
    if (!expiresIn) {
        return true;
    }
    return  new Date(expiresIn) > new Date();
};

var isRefreshTokenChecking = false;

Authentication.prototype.checkValidAndRefreshToken = function(request, response, next) {
    var that = this;
    var parsedUrl = url.parse(request.url);

    if ((unsecureUrl.check(parsedUrl.pathname)) || (!request._passport.session.user)) {
        return next();
    }

    if (checkExpires(request._passport.session.user.expires_in)) {
        return next();
    }

    if (isRefreshTokenChecking) {
        setTimeout(function () {
            that.checkValidAndRefreshToken(request, response, next);
        }, 500);
        return;
    }

    isRefreshTokenChecking = true;
    getAccessTokenUsingRefreshTokenFlow(this.getAuthOptions(request), request._passport.session.user, function(err, res){
        if (err) {
            logOutSession(request, response);
            isRefreshTokenChecking = false;
            return next(err);
        }
        res = JSON.parse(res);
        that.emit('tokenRefresh', res);
        request._passport.session.user.scope = res.scope;
        request._passport.session.user.accessToken = res.access_token;
        request._passport.session.user.refreshToken = res.refresh_token || request._passport.session.user.refreshToken;
        request._passport.session.user.expires_in = getExpirationDate(res.expires_in);
        isRefreshTokenChecking = false;
        next();
    });

};

/**
 * Gets authenticaton options
 *
 * @param {Object} req
 * @returns {Object} options
 */
Authentication.prototype.getAuthOptions = function(req) {
    var options = this.authOptions;
    if (this.authOptionsCallback) {
        options = _.defaults(this.authOptionsCallback(req) || {}, options);
    }
    return {
        callbackURL: options.callbackURL || '/auth/callback',
        clientID: options.clientId,
        clientSecret: options.clientSecret,
        uaaUrl: options.url,
        noContentSniff: options.noContentSniff,
        frameOptions: options.frameOptions,
        xssProtection: options.xssProtection,
        contentSecurityPolicy: options.contentSecurityPolicy,
        csrfProtection: options.csrfProtection,
        transportSecurity: options.transportSecurity
    };
};

/**
 * Sets authenticaton options
 *
 * @param {Object} options
 * @param {Function} optionsCallback (optional)
 */
Authentication.prototype.setAuthOptions = function(options, optionsCallback) {
    this.authOptions = options;
    this.authOptionsCallback = optionsCallback;
};

/**
 * main function that should be called by app
 * it initialize passport and make login logout routes
 *
 * @param  {Object} options
 * @param  {Function} optionsCallback
 */
Authentication.prototype.use = function (options, optionsCallback) {
    var that = this;

    this.setAuthOptions(options, optionsCallback);

    Strategy = this.Strategy || Strategy;

    this.app.use(checkSession);

    var strategy = null;
    if (optionsCallback) {
        strategy = new DynamicStrategy(function(req, options) {
            return new Strategy(that.getAuthOptions(req), that.verifyAuth.bind(that));
        });
    } else {
        strategy = new Strategy(this.getAuthOptions(), this.verifyAuth.bind(this));
    }

    passport.use(Authentication.STRATEGY_NAME, strategy);

    passport.serializeUser(function (user, done) {
        done(null, user);
    });
    passport.deserializeUser(function (user, done) {
        done(null, user);
    });

    this.app.use(passport.initialize());
    this.app.use(passport.session());

    if (options.isAllUrlsSecure) {
        this.app.use(this.ensureAuthenticated());
    }

    this.app.use(this.checkValidAndRefreshToken.bind(this));

    this.app.use(this.ensureSecurityHeaders());
};

/**
 * Returns function that ensures that security headers are set properly
 * could be used as middleware
 * 
 * options.noContentSniff {Boolean} - sets X-Content-Type-Options=nosniff , default value - true
 * options.frameOptions {String} - sets X-Frame-Options header (pass '' to disable header), default value - 'SAMEORIGIN'
 * options.xssProtection {Boolean} - sets X-XSS-Protection='1; mode=block' , default value - true
 * options.contentSecurityPolicy {Object} - sets Content-Security-Policy header , default value - null
 *      object should contain different policy rules as properties, for example:
 *      {
 *          "script-src": "https://*.talkgadget.google.com 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com",
 *          "object-src": "https://mail-attachment.googleusercontent.com"
 *      }
 * options.csrfProtection {Object|Boolean} - configures CSRF (Cross-Site Request Forgery) protection, default value - false
 *      The following options available:
 *      - csrfProtection.tokenKey {String} - the key for token: request.body[tokenKey] (optional), response.locals[tokenKey]
 *          default value '_csrfToken'
 *      - csrfProtection.tokenHeader {String} - the header for token: request.headers[tokenHeader] (optional)
 *          default value 'x-csrf-token'
 *      - csrfProtection.secretKey {String} - the key for secret for token generation: request.session[secretKey] (optional)
 *          default value '_csrfSecret'
 *      - csrfProtection.generate {Function} - the custom method for token generation (optional)
 *          signature: function(request, secretKey)
 *      - csrfProtection.validate {Function} - the custom method for token validation (optional)
 *          signature: function(request, secretKey, token)
 * options.transportSecurity {Object|Boolean} - configures HSTS (HTTP Strict Transport Security), default value - false
 *      The following options available:
 *      - transportSecurity.maxAge {Number} - max age
 *          default value - 31536000 (one year)
 *      - transportSecurity.includeSubDomains {Boolean} - include sub-domains
 *          default value - true
 *      - transportSecurity.autoRedirect {Boolean} - redirect to HTTPS automatically
 *          default value - true
 *
 *
 * @param  {Object} options (optional)
 *
 * @return {Function}
 */
Authentication.prototype.ensureSecurityHeaders = function (options) {
    var that = this;
    var getOptions = function (req, options) {
        options = options || that.getAuthOptions(req);
        var opts = {
            noContentSniff: _.isUndefined(options.noContentSniff) ? true : !!options.noContentSniff,
            frameOptions: _.isUndefined(options.frameOptions) ? 'SAMEORIGIN' : options.frameOptions,
            xssProtection: _.isUndefined(options.xssProtection) ? true : !!options.xssProtection,
            contentSecurityPolicy: !_.isObject(options.contentSecurityPolicy) ? null : options.contentSecurityPolicy,
            csrfProtection: _.isBoolean(options.csrfProtection) ? (options.csrfProtection && {}) : options.csrfProtection,
            transportSecurity: _.isBoolean(options.transportSecurity) ? (options.transportSecurity && {}) : options.transportSecurity
        };
        if (opts.csrfProtection) {
            opts.csrfProtection.tokenKey = opts.csrfProtection.tokenKey || '_csrfToken';
            opts.csrfProtection.tokenHeader = opts.csrfProtection.tokenHeader || 'x-csrf-token';
            opts.csrfProtection.secretKey = opts.csrfProtection.secretKey || '_csrfSecret';
            opts.csrfProtection.generate = opts.csrfProtection.generate || that.generateToken.bind(that);
            opts.csrfProtection.validate = opts.csrfProtection.validate || that.validateToken.bind(that);
        }
        if (opts.transportSecurity) {
            opts.transportSecurity.maxAge = opts.transportSecurity.maxAge || 31536000;
            opts.transportSecurity.includeSubDomains =
                _.isUndefined(opts.transportSecurity.includeSubDomains) ? true : !!opts.transportSecurity.includeSubDomains;
            opts.transportSecurity.autoRedirect =
                _.isUndefined(opts.transportSecurity.autoRedirect) ? true : !!opts.transportSecurity.autoRedirect;
        }
        return opts;
    };
    return function (req, res, next) {
        var opts = getOptions(req, options);
        var method = req.method;
        if (opts.noContentSniff) {
            res.set('X-Content-Type-Options', 'nosniff');
        }
        if (opts.frameOptions) {
            res.set('X-Frame-Options', opts.frameOptions);
        }
        if (opts.xssProtection) {
            res.set('X-XSS-Protection', '1; mode=block');
        }
        if (opts.contentSecurityPolicy) {
            var contentSecurityPolicy = '';
            _.forIn(opts.contentSecurityPolicy, function(val, key) {
                contentSecurityPolicy += key + ' ' + val + ';';
            });
            if (contentSecurityPolicy) {
                res.set('Content-Security-Policy', contentSecurityPolicy);
            }
        }
        if (opts.csrfProtection) {
            var token = opts.csrfProtection.generate(req, opts.csrfProtection.secretKey);
            res.locals[opts.csrfProtection.tokenKey] = token;
            if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
                token = (req.body && req.body[opts.csrfProtection.tokenKey]) || req.headers[opts.csrfProtection.tokenHeader];
                if (!opts.csrfProtection.validate(req, opts.csrfProtection.secretKey, token)) {
                    var csrfError = new Error('CSRF token mismatch');
                    csrfError.statusCode = res.statusCode = 403;
                    return next(csrfError);
                }
            }
        }
        if (opts.transportSecurity) {
            var transportSecurity = 'max-age=' + opts.transportSecurity.maxAge;
            if (opts.transportSecurity.includeSubDomains) {
                transportSecurity += '; includeSubDomains';
            }
            res.set('Strict-Transport-Security', transportSecurity);
            if (opts.transportSecurity.autoRedirect && getProtocol(req) === 'http') {
                if (method === 'GET') {
                    var requestUrl = req.url, parsedUrl = url.parse(requestUrl);
                    if (parsedUrl.query) {
                        var parsedQuery = querystring.parse(parsedUrl.query);
                        if (parsedQuery.redirect_uri) {
                            var redirectUrl = url.parse(parsedQuery.redirect_uri);
                            if (redirectUrl.protocol === 'http:') {
                                redirectUrl.protocol = 'https:';
                                parsedQuery.redirect_uri = url.format(redirectUrl);
                                parsedUrl.query = querystring.stringify(parsedQuery);
                                parsedUrl.search = '?' + parsedUrl.query;
                                requestUrl = url.format(parsedUrl);
                            }
                        }
                    }
                    return res.redirect('https://' + req.get('host') + requestUrl);
                } else {
                    var hstsError = new Error('HSTS rules violation (HTTPS required)');
                    hstsError.statusCode = res.statusCode = 403;
                    return next(hstsError);
                }
            }
        }
        next();
    };
};

/**
 * Tokenizes secret, for internal use only
 *
 * @param  {String} salt
 * @param  {String} secret
 *
 * @return {String} tokenized secret
 */
Authentication.prototype._tokenizeSecret = function(salt, secret) {
    return salt + crypto.createHash('sha256').update(salt + secret).digest('base64');
};


/**
 * Generates salt, for internal use only
 *
 * @param  {String} length
 *
 * @return {String} generated salt
 */
Authentication.prototype._generateSalt = function(length) {
    var symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var size = symbols.length;
    var result = '';
    for (var i = 0; i < length; ++i) {
        result += symbols[Math.random() * size | 0];
    }
    return result;
};

/**
 * Generates token
 *
 * @param  {Object} request - request object for Express
 * @param  {String} secretKey - secret key for Express session
 * @param  {Number} length - token length, default 10
 *
 * @return {String} token
 */
Authentication.prototype.generateToken = function (request, secretKey, length) {
    length = length || 10;
    var session = request.session;
    if (!session) {
        return null;
    }
    var secret = session[secretKey];
    if (!secret) {
        secret = crypto.pseudoRandomBytes(length).toString('base64');
        session[secretKey] = secret;
    }
    return this._tokenizeSecret(this._generateSalt(length), secret);
};

/**
 * Validates token
 *
 * @param  {Object} request - request object for Express
 * @param  {String} secretKey - secret key for Express session
 * @param  {String} token - token to be validated
 * @param  {Number} length - token length, default 10
 *
 * @return {Boolean} validation result
 */
Authentication.prototype.validateToken = function (request, secretKey, token, length) {
    length = length || 10;
    if (!token || !_.isString(token)) {
        return false;
    }
    var session = request.session;
    if (!session) {
        return false;
    }
    var secret = session[secretKey];
    if (!secret) {
        return false;
    }
    return (token === this._tokenizeSecret(token.slice(0, length), secret));
};

/**
 * check if user authenticated or not
 *
 * @param  {Object}   req
 * @param  {Object}   res
 * @param  {Function} next
 */
var ensureAuthenticated = function (req, res, next) {
    var parsedUrl = url.parse(req.url);
    if (req.isAuthenticated() || unsecureUrl.check(parsedUrl.pathname)) {
        return next();
    }

    if (req.method !== 'GET' || req.xhr) {
        return res.send(401);
    }

    var redirectUri = encodeURIComponent(createRedirectUrl(req));
    return res.redirect(util.format('/login?redirect_uri=%s', redirectUri));
};

exports.ensureAuthenticated = ensureAuthenticated;

/**
 * return function that check if the authenticated or not
 * could be used as middleware
 *
 * @return {Function}
 */
Authentication.prototype.ensureAuthenticated = function () {
    return ensureAuthenticated;
};
