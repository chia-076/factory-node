/*global describe, it, beforeEach: true*/

'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');

var socketAuthorization = rewire('../../lib/auth/socketAuthorization');

var onAuth,
    sessionStorage,
    getSessionCookie,
    handshakeData,
    callback;

describe('socketAuthorization', function () {
    beforeEach(function () {
        sessionStorage = {
            get: sinon.stub()
        };
        handshakeData = {
            headers: {
                cookie: 'foobar',
                referer: 'http://localhost:9000/sandbox'
            }
        };

        getSessionCookie = sinon.stub();
        callback = sinon.spy();
        socketAuthorization.__set__('getSessionCookie', getSessionCookie);

        onAuth = socketAuthorization.checkAuthorization(sessionStorage, 'foo', 'bar');

    });

    it('#checkAuthorization should return error if we dont have cookie', function () {
        handshakeData.headers = {};
        onAuth(handshakeData, callback);
        expect(callback.called).to.eql(true);
        expect(callback.getCall(0).args[0]).not.to.eql(null);
    });

    it('#checkAuthorization should return error we if cant parse cookie from cookie string', function () {

        getSessionCookie.returns(null);

        onAuth(handshakeData, callback);

        expect(getSessionCookie.called).to.eql(true);
        expect(getSessionCookie.getCall(0).args[0]).to.eql(handshakeData.headers.cookie);
        expect(callback.getCall(0).args[0]).not.to.eql(null);
    });
  
    it('#checkAuthorization should call callback without errors if page is unsecure', function () {
        var cookie = 'foo';
        getSessionCookie.returns(cookie);

        socketAuthorization.__set__('unsecureUrl', {check: function () {
            return true;
        }});


        onAuth(handshakeData, callback);

        expect(sessionStorage.get.called).to.eql(false);

        expect(callback.called).to.eql(true);

        expect(callback.getCall(0).args[0]).to.eql(null);

        socketAuthorization.__set__('unsecureUrl', {check: function () {
            return false;
        }});

    });

    it('#checkAuthorization should return error if session return error', function () {
        var cookie = 'foo';
        getSessionCookie.returns(cookie);

        sessionStorage.get.callsArgWith(1, true);
        
        onAuth(handshakeData, callback);

        expect(sessionStorage.get.called).to.eql(true);
        expect(callback.getCall(0).args[0]).not.to.eql(null);
    });

    it('#checkAuthorization should return error if session dont has user with token', function () {
        var cookie = 'foo';
        getSessionCookie.returns(cookie);

        sessionStorage.get.callsArgWith(1, null, {user: 'foo'});
        
        onAuth(handshakeData, callback);

        expect(sessionStorage.get.called).to.eql(true);
        expect(callback.getCall(0).args[0]).not.to.eql(null);
    });

    it('#checkAuthorization should call callback with true if session has user with token', function () {
        var cookie = 'foo';
        getSessionCookie.returns(cookie);
        var user = {
            accessToken: 'foo'
        };

        sessionStorage.get.callsArgWith(1, null, {user: user});
        
        onAuth(handshakeData, callback);

        expect(callback.getCall(0).args[0]).to.eql(null);
        expect(callback.getCall(0).args[1]).to.eql(true);
    });

    it('#checkAuthorization should emit event with user and handshakeData', function (done) {
        var cookie = 'foo';
        getSessionCookie.returns(cookie);
        var fakeUser = {
            accessToken: 'foo'
        };

        sessionStorage.get.callsArgWith(1, null, {user: fakeUser});
        
        socketAuthorization.on('successSocketLogin', function (user, handshake) {
            expect(user).to.eql(fakeUser);
            expect(handshake).to.eql(handshakeData);
            done();
        });

        onAuth(handshakeData, callback);

    });
});