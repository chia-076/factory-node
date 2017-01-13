/*global describe, it, beforeEach, before: true*/
'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var async = require('async');
var rewire = require('rewire');

 var cache = rewire('../../../lib/cache/cache');
var MemcachedCacheClient = rewire('../../../lib/cache/clients/memcached');
var VoidCacheClient = rewire('../../../lib/cache/clients/void');

describe('MemcachedCacheClient', function () {
    var setKeyStorage = MemcachedCacheClient.__get__('setKeyStorage');
    var findKeyInStorage = MemcachedCacheClient.__get__('findKeyInStorage');
    var deleteKeyInStorage = MemcachedCacheClient.__get__('deleteKeyInStorage');

    describe('#setKeyStorage', function () {

        it('should build key storage', function () {
            var result = {children: {}};
            result = setKeyStorage('a:b:c', ['a', 'b','c'], result);
            expect(result.children.a.children).to.have.property('b');
            expect(result.children.a.children.b.children).to.have.property('c');
            expect(result.children.a.children.b.children.c.value).to.eql('a:b:c');

            result = setKeyStorage('a:b', ['a', 'b'], result);
            expect(result.children.a.children).to.have.property('b');
            expect(result.children.a.children.b.value).to.eql('a:b');
            expect(result.children.a.children.b.children).to.have.property('c');
            expect(result.children.a.children.b.children.c.value).to.eql('a:b:c');
            
            result = setKeyStorage('d:e:r', ['d', 'e', 'r'], result);
            expect(result.children.d.children.e.children.r.value).to.eql('d:e:r');

        });
    });

    describe('#findKeyInStorage', function () {
        var storage;
        before(function () {
            storage = setKeyStorage('a:b:c', ['a', 'b', 'c'], storage);
            storage = setKeyStorage('a:b:d', ['a', 'b', 'd'], storage);
        });

        it('should find keys in storage by pattern', function () {
            var result = findKeyInStorage(['a','b','*'], storage);
            expect(result).to.be.an('array');
            expect(result).to.contain('a:b:c', 'a:b:d');
            var a = findKeyInStorage(['a', '*'], storage);
            expect(a).to.be.an('array');

        });

        it('should find key in storage', function () {
            var result = findKeyInStorage(['a','b','c'], storage);
            expect(result).to.be.a('string');
            expect(result).to.eql('a:b:c');
        });

        it('should return null if there is no such key in storage', function() {
            var result = findKeyInStorage(['a', 'c'], storage);
            expect(result).to.eql(null);
            var wrongResult = findKeyInStorage(['a', 'd', 'c', '*'], storage);
            expect(wrongResult).to.eql(null);
        });

        it('should return null if the key does not contain value and there is no star in pattern', function () {
            var wrongResult = findKeyInStorage(['a','b'], storage);
            expect(wrongResult).to.eql(null);
        });
    });

    describe('#deleteKeyInStorage', function () {
        var storage;
        beforeEach(function () {
            storage = {children: {}};
            storage = setKeyStorage('a:b:c', ['a', 'b', 'c'], storage);
            storage = setKeyStorage('a:b:d', ['a', 'b', 'd'], storage);
        });

        it('should delete key in storage by pattern', function () {
            storage = deleteKeyInStorage(['a','b', '*'], storage);
            expect(storage).to.be.an('object');
            var c = findKeyInStorage(['a', 'b', '*'], storage);
            expect(c).to.be.eql(null);
        });

        it('should delete some key by name', function () {
            storage = deleteKeyInStorage(['a', 'b', 'c'], storage);
            expect(storage).to.be.an('object');
            var c = findKeyInStorage(['a', 'b', 'd'], storage);
            expect(c).to.eql('a:b:d');
        });
        
        it('should delete some key by wildcard name', function () {
            storage = setKeyStorage('y:m:k', ['y', 'm', 'k'], storage);
            storage = setKeyStorage('y:x:k', ['y', 'x', 'k'], storage);
            storage = deleteKeyInStorage(['y', '*', 'k'], storage);
            expect(storage).to.be.an('object');
            var c = findKeyInStorage(['y', '*', 'k'], storage);
            expect(c).to.eql(null);
            var c = findKeyInStorage(['a', '*', 'c'], storage);
            expect(c).to.be.eql('a:b:c');
            
        });
        
         it('should delete some key by single', function () {
            storage = setKeyStorage('l', ['l'], storage);
            var c = findKeyInStorage(['l'], storage);
            expect(c).to.eql(['l']);   
            var c = findKeyInStorage(['kak'], storage);
            expect(c).to.eql(null); 
        });
        
        it('should find some key by wildcard name with double depth', function () {
            //'a1b2c', 'a3b4c', 'a5b6d'
            storage = {children: {}};
            storage = setKeyStorage('a:1:b:2:c', ['a', '1', 'b', '2', 'c'], storage);
            storage = setKeyStorage('a:3:b:4:c', ['a', '3', 'b', '4', 'c'], storage);
            storage = setKeyStorage('a:5:b:6:c', ['a', '5', 'b', '6', 'c'], storage);
            
           
            var j = findKeyInStorage(['a', '*', 'b', '*', 'c'], storage);
            expect(j.length).to.eql(3);
            storage = deleteKeyInStorage(['*', '*', 'b'], storage);
            j = findKeyInStorage(['a', '*'], storage);
            expect(j.length).to.eql(3);
            
            storage = deleteKeyInStorage(['a', '5', 'b', '*'], storage);
            var j = findKeyInStorage(['a', '*'], storage);
            expect(j.length).to.eql(2);

        });
        
        
        
        it('should not delete without exact match ', function () {
            storage = deleteKeyInStorage(['a', 'b', 'c'], storage);
            expect(storage).to.be.an('object');
            var c = findKeyInStorage(['a', 'b'], storage);
            expect(c).to.eql(null);
        });
        
        it('should delete some key by wildcard name and 3 el', function () {
            storage = {children: {}};
            storage = setKeyStorage('a:1:b', ['a', '1', 'b'], storage);
            storage = setKeyStorage('a:2:b', ['a', '2', 'b'], storage);
            storage = setKeyStorage('a:3:c', ['a', '3', 'c'], storage);
           
            var c = findKeyInStorage(['a', '*', 'b'], storage);
            expect(c.length).to.eql(2);
            
        });
        
        it('should not delete any key if the pattern is wrong', function () {
            deleteKeyInStorage(['a', 'd', 'c'], storage);
            expect(storage).to.be.an('object');
            var b = findKeyInStorage(['a', 'b', '*'], storage);
            expect(b).to.contain('a:b:c', 'a:b:d');

            var d = findKeyInStorage(['a', 'b', 'd'], storage);
            expect(d).to.eql('a:b:d');
        });
    });

});

//Added mocked from Session
describe('integration Memcached degradation', function() {
    var cacheClient = {
        set: function() {
        },
        get: function() {
        },
        delete: function() {
        },
        setupDegradation: function(onConnect, onError) {
            onError(new Error('test'));
        }
    };

    var cacheClientMock;
    
    cacheClientMock = sinon.mock(cacheClient);
    cache.registerCacheClient('test', function() {
        return cacheClient;
    });



    cache.registerCacheClient('void', function() {
        return new VoidCacheClient(true);
    });
    cache.setFailOverClient('void');

    cache.setClient('test');


    it('should call client method get with params', function(done) {

        async.waterfall([            
            function(next) {
                cache.set('foo:qaz', 'qaz', next);
            },
            function(next) {
                cache.get('foo:qaz', next);
            }
        ], function(err, res) {
            expect(err).to.eql(null);
            expect(res).to.eql('qaz');
            done();
        });



    });

});

describe.skip('integration MemcachedCacheClient', function () {
    var client;
    before(function () {
        client = new MemcachedCacheClient(['127.0.0.1:11211'], {retry: 3000});
    });

    it('should set some key to memcache', function (done) {
        async.waterfall([
            client.set.bind(client, 'foo', 'bar'),
            function (next) {
                client.get('foo', next);
            },
            function (result, next) {
                expect(result).to.eql('bar');
                next();
            }
        ], function (err) {
            if (err) {
                done(err);
            }
            client.delete('foo', function (err) {
                setTimeout(done, 3000);
            });
        });
    });


    it('should set two keys and than delete them by pattern', function (done) {
        async.waterfall([
            client.set.bind(client, 'foo:bar', 'bar'),
            function (next) {
                client.set('foo:qaz', 'qaz', next);
            },
            function (next) {
                client.delete('foo:*', true, next);
            },
            function (next) {
                client.get('foo:qaz', next);
            }
        ], function (err, res) {
            expect(err).to.eql(null);
            expect(res).to.eql(null);
            done();
        });
    });
});

