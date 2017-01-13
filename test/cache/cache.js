/*global describe, it, beforeEach, before, afterEach: true*/
'use strict';

var sinon = require('sinon');
var rewire = require('rewire');

describe('cache', function () {
    var cacheClient, failoverClient, api;
    var cacheClientMock, failoverClientMock, apiMock;

    var cache, clock;

    var key = 'foo';
    var value = 'bar';
    var ttl = 15;

    beforeEach(function () {
        clock = sinon.useFakeTimers();
        cache = rewire('../../lib/cache/cache');

        cacheClient = {
            set: function () {},
            get: function () {},
            setupDegradation: function () {},
            delete: function () {}
        };

        failoverClient = {
            set: function () {},
            get: function () {},
            delete: function () {}
        };

        api = {
            callback: function () {}
        };

        cacheClientMock = sinon.mock(cacheClient);
        failoverClientMock = sinon.mock(failoverClient);
        apiMock = sinon.mock(api);

        apiMock.expects('callback')
            .once();

        cache.setRequestTimeout(1);
        cache.setSlowRequestCount(1);
        cache.setSlowRequestFailoverTimeout(1);
        cache.setLoadBalancer(function() { return 1; });

        cache.registerCacheClient('testCacheClient', function () {
            return cacheClient;
        });
        cache.registerCacheClient('testFailoverClient', function () {
            return failoverClient;
        });

        cache.setClient('testCacheClient');
        cache.setFailOverClient('testFailoverClient');
    });

    afterEach(function () {
        clock.restore();
    });

    describe('#get', function () {

        it('should call client method "get" with params', function () {
            cacheClientMock.expects('get')
                .once()
                .withArgs(key)
                .onFirstCall()
                .callsArg(1);

            cache.get(key, api.callback);

            cacheClientMock.verify();
            apiMock.verify();
        });

        it('should call callback after timeout in case of slow response', function () {
            cacheClientMock.expects('get')
                .once()
                .withArgs(key);

            cache.get(key, api.callback);

            clock.tick(1000);

            cacheClientMock.verify();
            apiMock.verify();
        });
    });

    describe('#set', function () {

        it('should call client method "set" with default ttl if it is missing', function () {
            cacheClientMock.expects('set')
                .once()
                .withArgs(key, value, cache.__get__('DEFAULT_TTL'))
                .onFirstCall()
                .callsArg(3);

            cache.set(key, value, api.callback);

            cacheClientMock.verify();
            apiMock.verify();
        });

        it('should call callback after timeout in case of slow response', function () {
            cacheClientMock.expects('set')
                .once()
                .withArgs(key, value, cache.__get__('DEFAULT_TTL'));

            cache.set(key, value, api.callback);

            clock.tick(1000);

            cacheClientMock.verify();
            apiMock.verify();
        });

        it('should call client method "set" with ttl and with default callback', function () {
            cacheClientMock.expects('set')
                .once()
                .withArgs(key, value, ttl);

            cache.set(key, value, ttl);
            cacheClientMock.verify();
        });

    });

    describe('#delete', function () {

        it('should call client method "delete" with pattern and with callback', function () {
            cacheClientMock.expects('delete')
                .once()
                .withArgs(key, true)
                .onFirstCall()
                .callsArg(2);

            cache.delete(key, true, api.callback);

            cacheClientMock.verify();
            apiMock.verify();
        });

        it('should call callback after timeout in case of slow response', function () {
            cacheClientMock.expects('delete')
                .once()
                .withArgs(key, true);

            cache.delete(key, true, api.callback);

            clock.tick(1000);

            cacheClientMock.verify();
            apiMock.verify();
        });

    });

    describe('#wrapWithCache', function () {

        it('should call client methods "get" and "set"', function () {
            cacheClientMock.expects('get')
                .once()
                .withArgs(key)
                .onFirstCall()
                .callsArg(1);

            cacheClientMock.expects('set')
                .once()
                .withArgs(key, value, cache.__get__('DEFAULT_TTL'));

            cache.wrapWithCache(function () { return key; }, function(done) {
                done(null, value);
            })(api.callback);

            cacheClientMock.verify();
            apiMock.verify();
        });

    });

    describe('#setupDegradation', function () {

        it('should switch to failover client in case of errors', function () {
            cacheClientMock.expects('setupDegradation')
                .once()
                .onFirstCall()
                .callsArg(1);

            cache.setupDegradation();

            cacheClientMock.verify();

            failoverClientMock.expects('get')
                .once()
                .withArgs(key)
                .onFirstCall()
                .callsArg(1);

            cache.get(key, api.callback);

            failoverClientMock.verify();
            apiMock.verify();
        });

        it('should switch to normal client on reconnect', function () {
            cacheClientMock.expects('setupDegradation')
                .once()
                .onFirstCall()
                .callsArg(1)
                .callsArg(0);

            cache.setupDegradation();

            cacheClientMock.verify();

            cacheClientMock.expects('get')
                .once()
                .withArgs(key)
                .onFirstCall()
                .callsArg(1);

            cache.get(key, api.callback);

            cacheClientMock.verify();
            apiMock.verify();
        });

    });
});
