'use strict';
var util = require('util'),
    request = require('request'),
    _ = require('lodash'),
    async = require('async');

var authMock = require('../authMock/authentication');

var Authentication = authMock.Authentication;

/**
 * PasswordAuthentication
 * @param {Object} app
 * @constructor
 */
var PasswordAuthentication = function (app) {
    Authentication.call(this, app);
};

util.inherits(PasswordAuthentication, Authentication);

/**
 * Get token
 * @param {Function} callback
 */
PasswordAuthentication.prototype.getTokens = function (callback) {
    var tokenUrl = this.host + '/oauth/token';
    var authentication =  new Buffer(this.clientID + ':' + this.clientSecret).toString('base64');
    request.post({
        url: tokenUrl,
        form: {
            grant_type: 'password',
            username: this.credentials.username,
            password: this.credentials.password
        },
        headers: {
            Authorization: 'Basic ' + authentication,
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
 * Get user's info
 * @param {Function} callback
 */
PasswordAuthentication.prototype.getUser = function (callback) {
    var that = this;
    var userInfo = {
        email: this.credentials.username
    };

    async.waterfall([
        function (next) {
            that.getTokens(next);
        },
        function (tokens, next) {
            userInfo.accessToken = tokens.access_token;
            userInfo.refreshToken = tokens.refresh_token;

            that.getUserInfo(userInfo.accessToken, next);
        }
    ], function (err, res) {
        if (err) {
            console.log('[Error]', err);
            return callback(err);
        }
        userInfo = _.extend(userInfo, res);
        callback(null, userInfo);
    });
};

exports.Authentication = PasswordAuthentication;
