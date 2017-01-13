/*global describe, it, beforeEach: true*/

'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');
var util = require('util');

var Strategy = rewire('../../../lib/auth/passport-uaa/strategy');
var OAuth2Strategy = require('passport-oauth').OAuth2Strategy;


describe('Strategy', function () {
    it('should inherits form OAuth2Strategy and return an instance ', function () {
        var options = {
            uaaUrl: 'http://foo.com',
            clientID: 'dsasd',
            clientSecret: 'sda'
        };

        var strategy = new Strategy(options);

        expect(options.tokenURL).to.eql(options.uaaUrl + '/oauth/token');
        expect(options.authorizationURL).to.eql(options.uaaUrl + '/oauth/authorize');
        expect(strategy._userProfileURI).to.eql(options.uaaUrl + '/userinfo');
        expect(strategy instanceof OAuth2Strategy).to.eql(true);

        var authString = util.format('%s:%s', options.clientID, options.clientSecret);
        var auth = 'Basic ' + new Buffer(authString).toString('base64');

        expect(options.customHeaders).to.eql({Authorization: auth});

    });
});