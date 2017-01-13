/*global describe, it, beforeEach, before: true*/
'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var rewire = require('rewire');

var RedisCacheClient = rewire('../../../lib/cache/clients/redis');


describe('RedisCacheClient', function () {
    var redisClient;
    var redis;

    before(function () {
        redis = {
            createClient: sinon.stub()
        };

        redis.createClient.returns({
            on: function () {}
        });

        RedisCacheClient.__set__('redis', redis);
    });

    describe('#createClient', function () {
        it('should call redis#createClient in constructor', function () {
            redisClient = new RedisCacheClient(80, 'bar.com');

            expect(redis.createClient.called).to.eql(true);

            expect(redis.createClient.getCall(0).args).contain(80);
            expect(redis.createClient.getCall(0).args).contain('bar.com');
        });
    });

    describe('#set', function () {
        var client;

        beforeEach(function () {
            client = {
                setex: sinon.spy(),
                set: sinon.stub(),
                on: function(){}
            };
            redis.createClient.returns(client);
            redisClient = new RedisCacheClient(80, 'bar.com');
        });

        it('should save value to cache using setex with ttl', function () {
            redisClient.set('foo', 'bar', 100);
            expect(client.setex.called).to.eql(true);

            var call = client.setex.getCall(0);

            expect(call.args[0]).to.eql('foo');
            expect(call.args[1]).to.eql(100);
            expect(call.args[2]).to.eql('bar');
        });

        it('should save value to cache using set if no ttl is false', function () {
            redisClient.set('foo', 'bar', false);
            expect(client.set.called).to.eql(true);

            var call = client.set.getCall(0);

            expect(call.args[0]).to.eql('foo');
            expect(call.args[1]).to.eql('bar');
        });

        it('should stringify value before saving ', function () {
            var value = {bar: 'bar'};
            redisClient.set('foo', value, false);

            var call = client.set.getCall(0);
            expect(call.args[1]).to.eql(JSON.stringify(value));
        });

        it('should save value and invoke callback after saving if it passed', function (done) {
            client.set.callsArg(2);

            redisClient.set('foo', 'bar', false, function () {
                expect(client.set.called).to.eql(true);

                var call = client.set.getCall(0);

                expect(call.args[0]).to.eql('foo');
                expect(call.args[1]).to.eql('bar');
                done();
            });
        });
    });

    describe('#get', function () {
        var client;
        before(function () {
            client = {
                get: sinon.stub(),
                on: function () {}
            };

            redis.createClient.returns(client);
            redisClient = new RedisCacheClient(80, 'bar.com');
        });

        it('should should call client#get method and parse strigns n value', function (done) {
            var value = {bar: 'bar'};
            client.get.callsArgWith(1, null, JSON.stringify(value));

            redisClient.get('foo', function (err, res) {
                expect(err).to.eql(null);
                expect(res).to.have.property('bar', value.bar);
                done();
            });
        });
    });
});

