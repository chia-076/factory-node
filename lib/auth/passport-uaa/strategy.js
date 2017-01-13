'use strict';

var util = require('util');
var OAuth2Strategy = require('passport-oauth').OAuth2Strategy;

var Strategy = function (options, verify) {
    this._userProfileURI = null;
    this._stateParamCallback = null;

    options = options || {};
    options.authorizationURL = options.uaaUrl + '/oauth/authorize';
    options.tokenURL = options.uaaUrl + '/oauth/token';
    options.useAuthorizationHeaderForGET = true;

    // # Send clientID & clientSecret in 'Authorization' header;
    var authString = util.format('%s:%s', options.clientID, options.clientSecret);
    var auth = 'Basic ' + new Buffer(authString).toString('base64');
    options.customHeaders = {Authorization: auth};

    // according to the oAuth2 standard clientSecret could be 
    // an empty string but OAuth2Strategy throw an error in this case.
    // In order to prevent from such errors, we set an whitespace to clientSecret 
    // if it equal to empty string.
    if (options.clientSecret === '') {
        options.clientSecret = ' ';
    }

    OAuth2Strategy.call(this, options, verify);

    this.name = 'uaa';
    this._userProfileURI = options.uaaUrl + '/userinfo';

    // # Store auth in a different variable so we can reset it back.
    this._origCustomHeader = options.customHeaders;

    // # Set AuthMethod as 'Bearer' (used w/ accessToken to perform actual resource actions)
    this._oauth2.setAuthMethod('Bearer');

    // # use an 'Authorize' header instead of passing the access_token as a query parameter
    this._oauth2.useAuthorizationHeaderforGET(true);

};

util.inherits(Strategy, OAuth2Strategy);

/**
 * Resets _customHeaders to original _customHeaders - This is a workaround because of a
 * bug https://github.com/jaredhanson/passport/issues/89 that causes
 * "logout current user & then relogin to fail"
 * Call this 'cfStrategy.reset()' when you are logging off a user.
 */
Strategy.prototype.reset = function () {
    var that = this;
    this._oauth2._customHeaders = {
        Authorization: that._origCustomHeader.Authorization
    };
};

/**
 * Override authorizationParams function. In our case, we will check if this._stateParamCallback is
 * set. If so, we'll call that callback function to set {'state' : 'randomStateVal'}
 *
 * @return {Object}         {} or {'state' : 'randomStateValFrom__stateParamCallback'}
 */
Strategy.prototype.authorizationParams = function () {
    var that = this;
    if (!this._stateParamCallback) {
        return {};
    }

    return {
        state: that._stateParamCallback()
    };
};


Strategy.prototype.setStateParamCallBack = function (callback) {
    this._stateParamCallback = callback;
};

/**
 * Retrieve user profile from Cloud Foundry.
 *
 * This function calls /info endpoint of Cloud Foundry and returns the result
 * as 'profile'
 *
 * @param {String} accessToken
 * @param {Function} done
 * @api protected
 */
Strategy.prototype.userProfile = function (accessToken, done) {
    this._oauth2.get(this._userProfileURI, accessToken, function (err, body) {
        if (err) {
            return done(err);
        }
        try {
            done(null, JSON.parse(body));
        } catch (e) {
            done(e);
        }
    });
};

module.exports = Strategy;

