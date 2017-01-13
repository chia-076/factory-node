/*global describe, it, beforeEach: true*/

'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');
var util = require('util');

var Strategy = rewire('../../../lib/auth/passport-uaa/strategy');
var DynamicStrategy = rewire('../../../lib/auth/passport-uaa/dynamicStrategy');
var PassportStrategy = require('passport').Strategy;


describe('DynamicStrategy', function () {
    it('should inherits form Passport Strategy and create an instance of real strategy', function () {
        var options = {
            uaaUrl: 'http://foo.com',
            clientID: 'dsasd',
            clientSecret: 'sda'
        };

        var strategyMock = {
            authenticate: sinon.stub()
        };

        var requestMock = {
            url: '/testurl/1'
        };

        var strategy = new DynamicStrategy(function(req, opts) {

            expect(req).to.eql(requestMock);
            expect(opts).to.eql(options);

            return strategyMock;
        });

        expect(strategy instanceof PassportStrategy).to.eql(true);

        strategy.authenticate(requestMock, options);

        expect(strategyMock.authenticate.called).to.eql(true);

        var call = strategyMock.authenticate.getCall(0);

        expect(call.args).to.have.length(2);

        expect(call.args[0]).to.eql(requestMock);
        expect(call.args[1]).to.eql(options);

    });
});
