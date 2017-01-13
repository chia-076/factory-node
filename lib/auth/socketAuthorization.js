'use strict';

var parseSignedCookies = require('connect').utils.parseSignedCookies,
    EventEmitter = require('events').EventEmitter,
    url = require('url'),
    cookie = require('cookie');

var unsecureUrl = require('./unsecureUrl');
var eventEmitter = new EventEmitter();

/**
 * get session cookie for coockies string
 * and decrypt it using sessionKey and secret
 * @param  {String} cookies
 * @param  {String} sessionKey
 * @param  {String} sessionSecret
 * @return {String}
 */
var getSessionCookie = function (cookies, sessionKey, sessionSecret) {
    cookies = cookie.parse(cookies);

    var parsed = parseSignedCookies(cookies, sessionSecret);

    return parsed[sessionKey] || null;
};


/**
 * returns function that trying to obtain session cookie form handshakeData
 * and than using this coockie trying to get session after it it cheks if we have 
 * accessToken on user object at session
 * 
 * @param  {Object} sessionStore
 * @param  {String} sessionKey
 * @param  {String} sessionSecret
 * @return {Function}
 */
eventEmitter.checkAuthorization = function (sessionStore, sessionKey, sessionSecret) {
    var that = this;
    return function (handshakeData, callback) {
        var cookies = handshakeData.headers.cookie;
        if (!cookies) {
            return callback('There are no cookies in the headers');
        }

        var sessionCookie = getSessionCookie(cookies, sessionKey, sessionSecret);

        if (!sessionCookie) {
            return callback('There is no session cookie or cookie couldnt be parsed by secret');
        }
        var refererUrl = url.parse(handshakeData.headers.referer);

        if (unsecureUrl.check(refererUrl.pathname)) {
            return callback(null, true);
        }

        sessionStore.get(sessionCookie, function (err, session) {
            if (err || !session) {
                return callback(err || 'Session is undefined');
            }

            if (!session.user && !session.passport.user) {
                return callback('there is no user object in session');
            }

            var user = session.user || session.passport.user;
            if (!user.accessToken || typeof user.accessToken !== 'string') {
                return callback('there is no accessToken in session object');
            }

            that.emit('successSocketLogin', user, handshakeData);
            callback(null, true);
        });
    };
};


module.exports = eventEmitter;