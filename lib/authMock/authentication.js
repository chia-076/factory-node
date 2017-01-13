'use strict';

var request = require('request'),
    url = require('url'),
    _ = require('lodash'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    async = require('async');

var state = 'FJHRY3';
var redirectUri = 'http://some.host.dev';

var authInstance = null;

var Authentication = function (app) {
    if (authInstance) {
        return authInstance;
    }
    this.app = app;
    authInstance = this;
};

util.inherits(Authentication, EventEmitter);

Authentication.prototype.use = function (options) {
    this.host = options.url;
    this.clientID = options.clientId;
    this.clientSecret = options.clientSecret;
    this.credentials = options.credentials;

    if (!this.credentials || !this.credentials.username || !this.credentials.password) {
        throw new Error('bad credentials in AuthMock');
    }

    if (options.isAllUrlsSecure) {
        this.app.use(this.ensureAuthenticated());
    }
};


Authentication.prototype.makeRoutes = function () {};


/**
 * make request on lofin endpoint and get coocie JSESSIONID from headers
 * @param  {Function} callback
 */
Authentication.prototype.getSessionCookie = function (callback) {
    var loginUrl = this.host + '/login.do';
    request.post({
        url: loginUrl,
        qs: this.credentials,
        headers: {
            Accept: 'application/json'
        },
        followRedirect: false
    }, function (err, res) {
        if (err) {
            return callback(err);
        }
        var cookies = res.req.res.headers['set-cookie'];

        cookies = cookies.filter(function (cookie) {
            return (cookie.indexOf('JSESSIONID') >= 0);
        });

        if (!cookies[0]) {
            return callback('There is no JSESSIONID cookie');
        }
        callback(null, cookies[0]);
    });
};


/**
 * make request on /oauth/authorize endpoint end pass to
 * the callback authorithation code from header field Location
 * 
 * @param  {String}   cookie
 * @param  {Function} callback
 */
Authentication.prototype.getAuthCode = function (cookie, callback) {
    var getCodeUrl = this.host + '/oauth/authorize';
    var query = {
        client_id: this.clientID,
        redirect_uri: redirectUri,
        response_type: 'code',
        state: state
    };

    request.post({
        url: getCodeUrl,
        qs: query,
        headers: {
            Accept: 'application/json',
            Cookie: cookie
        },
        followRedirect: false
    }, function (err, res) {
        if (err) {
            return callback(err);
        }
        var location = res.req.res.headers.location;
        var parsed = url.parse(location, true);

        if (!parsed.query.code) {
            return callback('There is no auth code in response');
        }

        callback(null, parsed.query.code);
    });
};

/**
 * return information about token form /oauth/token endpoint
 * 
 * @param  {String}   authCode
 * @param  {Function} callback
 */
Authentication.prototype.getTokens = function (authCode, callback) {
    
    var tokenUrl = this.host + '/oauth/token';
    request.post({
        url: tokenUrl,
        auth: {
            username: this.clientID,
            password: this.clientSecret
        },
        qs: {
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: redirectUri
        },
        headers: {
            Accept: 'application/json'
        }

    }, function (err, res, body) {
        if (err) {
            return callback(err);
        }
        callback(null, JSON.parse(body));
    });
};

/**
 * get information about user by authToken
 * @param  {Function} callback
 */
Authentication.prototype.getUserInfo = function (accessToken, callback) {
    var userInfoUrl = this.host + '/userinfo';
    request.get({
        url: userInfoUrl,
        headers: {
            Authorization: 'Bearer ' + accessToken
        }
    }, function (err, res, body) {
        if (err) {
            return callback(err);
        }
        callback(null, JSON.parse(body));
    });
};

/**
 * get user object for authentication
 * @param  {Function} callback
 */
Authentication.prototype.getUser = function (callback) {
    var that = this;
    var userInfo = {
        email: this.credentials.username
    };

    async.waterfall([
        function (next) {
            that.getSessionCookie(next);
        },
        function (cookie, next) {
            that.getAuthCode(cookie, next);
        },
        function (code, next) {
            that.getTokens(code, next);
        },
        function (tokens, next) {
            userInfo.accessToken = tokens.access_token;
            userInfo.refreshToken = tokens.refresh_token;

            that.getUserInfo(userInfo.accessToken, next);
        }
    ], function (err, res) {
        if (err) {
            return callback(err);
        }
        userInfo = _.extend(userInfo, res);
        callback(null, userInfo);
    });
};


var ensureAuthenticated = function (req, res, callback) {
    if (req.session.user) {
        req.user = req.session.user;
        return callback();
    }

    var auth = new Authentication();

    auth.getUser(function (err, user) {
        if (err) {
            return callback(err);
        }
        auth.emit('successLogin', user);
        req.session.user = user;
        req.user = user;
        callback();
    });

};

exports.ensureAuthenticated = ensureAuthenticated;


/**
 * authenticate user
 * @param  {IncomingMessage}   req
 */
Authentication.prototype.ensureAuthenticated = function () {
    return ensureAuthenticated;
};

/**
 * Returns mock function that ensures that security headers are set properly
 * could be used as middleware
 *
 * @return {Function}
 */
Authentication.prototype.ensureSecurityHeaders = function () {
    return function (req, res, next) {
        next();
    };
};

/**
 * Returns mock function that gets authenticaton options
 */
Authentication.prototype.getAuthOptions = function() {
    return {};
};

/**
 * Returns mock function that sets authenticaton options
 */
Authentication.prototype.setAuthOptions = function() {};

/**
 * Returns mock function that checks if the url is unsecure
 */
Authentication.prototype.checkUnsecureUrl = function () {
    return false;
};

/**
 * Returns mock function that adds unsecure url
 */
Authentication.prototype.addUnsecureUrl = function () {};

exports.Authentication = Authentication;