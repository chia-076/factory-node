/*global describe, it, beforeEach, before, afterEach: true*/
'use strict';
'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var async = require('async');
var rewire = require('rewire');
var expressSession = require('express-session');
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;
var VoidCacheClient = require('../../lib/cache/clients/void');
var sessionClientStore = require('../../lib/cache/sessionClientStore');
var Session = sessionClientStore.Session(expressSession);
var MemcachedSession = sessionClientStore.MemcachedSession(expressSession);



describe('sessionClientStore', function() {

    describe.skip('#get', function() {
        var client = new MemcachedSession({
            hosts: ['127.0.0.1:11211'],
            prefix: 'foo:bar'
        });

        //client.emit('issue', new Error('issue'));  

        it('should call client method get with params', function() {
            client.on('clientError', function(err) {
                async.waterfall([
                    //client.set.bind(client, 'foo:bar', 'bar'),
                    function(next) {
                        client.set('foo:qaz', 'qaz', next);
                    },
                    function(next) {
                        client.destroy('foo:*', function() {
                        }, next);
                    },
                    function(next) {
                        client.get('foo:qaz', next);
                    }
                ], function(err, res) {
                    expect(err).to.eql(null);
                    expect(res).to.eql(null);
                    done();
                });
            });


        });
    });


    describe('#set', function() {
        var Session = require('../../lib/cache/sessionClientStore').Session(expressSession);
        var session = new Session({});
        var sessionClient = Object.create(new EventEmitter());
        sessionClient = _.assign(sessionClient,{ 
            set: function() {
            },
            get: function() {
            },
            delete: function() {
            },
            setupDegradation: function(onConnect, onError) {
                onError(new Error('test'));
            }
        });
   
        var sessionClientMock;

        sessionClientMock = sinon.mock(sessionClient);
        session.registerCacheClient('test', function () {
            return sessionClient;
        });
        
        
       
        session.registerCacheClient('memory_store', function() {
            return new VoidCacheClient(true);
        });
        session.setFailOverClient('memory_store');

        session.setClient('test');
        
        

        it('should call client method get with params', function(done) {
            
                async.waterfall([
                    //client.set.bind(client, 'foo:bar', 'bar'),
                    function(next) {
                        session.set('foo:qaz', 'qaz', next);
                    },
                    function(next) {
                        session.get('foo:qaz', next);
                    }
                ], function(err, res) {
                    expect(err).to.eql(null);
                    expect(res).to.eql('qaz');
                    done();
                });
  


        });
    });


    describe('#setupDegradation', function () {

        var cacheClient, failoverClient, api;
        var cacheClientMock, failoverClientMock, apiMock;

        var cache, clock;

        var key = 'foo';

        beforeEach(function () {
            clock = sinon.useFakeTimers();
            cache = new Session();

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

            expect(cache.client).to.eql(cache.defaultFailOverClient);
            expect(cache.failOverClient).to.eql(cache.defaultClient);
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

            expect(cache.client).to.eql(cache.defaultClient);
            expect(cache.failOverClient).to.eql(cache.defaultFailOverClient);
        });

    });

});
