/*global describe, beforeEach, afterEach, before, after, it: true*/

'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');
var http = require('http');
var request = require('request');
var express = require('express');
var bodyParser = require('body-parser');

var serviceProxy = rewire('../../lib/serviceProxy/serviceProxy');



describe('serviceProxy', function () {
    var server, serverPort, service, servicePort;
    var accessToken = '123token';

    var initService = function (done) {
        service = express();

        service.httpServer = http.createServer(service);

        service.use(bodyParser.json());

        service.get('/error', function (req, res) {
            res.send(300);
        });

        service.get('/*', function (req, res) {
            res.json({
                url: req.originalUrl,
                method: req.method,
                headers: req.headers,
                body: req.body
            });
        });

        service.post('/*', function (req, res) {
            res.json({
                url: req.originalUrl,
                method: req.method,
                headers: req.headers,
                body: req.body
            });
        });

        service.httpServer.listen(0, function(){
            servicePort = service.httpServer.address().port.toString();
            done();
        });
    };

    var initServer = function (done) {
        server = express();

        server.httpServer = http.createServer(server);

        server.use(function (req, res, next) {
            req.user = { accessToken: accessToken };

            next();
        });

        server.use(bodyParser.json());

        server.httpServer.listen(0, function(){
            serverPort = server.httpServer.address().port.toString();
            done();
        });
    };

    var initAll = function(done) {
        initServer(function () {
            initService(done);
        });
    };

    var closeAll = function(done) {
        serviceProxy.removeProxiedService('service');
        server.httpServer.close(function() {
            if (!service.httpServer) {
                return done();
            }
            service.httpServer.close(done);
        });
    };

    var addService = function(options) {
        serviceProxy.addProxiedServices({
            service: options
        });

        serviceProxy.createProxy(server);
    };

    describe('#initialization via config using href param', function () {

        beforeEach(initAll);

        it('should correct proxy requests without path', function (done) {
            addService({
                href: 'http://localhost:' + servicePort
            });

            request({
                url: 'http://localhost:' + serverPort + '/services/service/test',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/test');

                done();
            });
        });

        it('should correct proxy requests with path', function (done) {
            addService({
                href: 'http://localhost:' + servicePort + '/testpath'
            });

            request({
                url: 'http://localhost:' + serverPort + '/services/service/test',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/testpath/test');

                done();
            });
        });

        afterEach(closeAll);
    });

    describe('#initialization via config with host and port', function () {

        beforeEach(initAll);

        it('should correct proxy requests without path', function (done) {
            addService({
                host: 'localhost',
                port: servicePort
            });

            request({
                url: 'http://localhost:' + serverPort + '/services/service/endpoint',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/endpoint');

                done();
            });
        });

        it('should correct proxy requests with path', function (done) {
            addService({
                host: 'localhost',
                port: servicePort,
                path: '/testpath'
            });

            request({
                url: 'http://localhost:' + serverPort + '/services/service/endpoint',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/testpath/endpoint');

                done();
            });
        });

        afterEach(closeAll);
    });

    describe('#initialization via constructor', function () {

        beforeEach(initAll);

        it('should correct proxy requests after initialization', function (done) {
            var proxy = serviceProxy.createProxyInstance(server, 'service', 'http://localhost:' + servicePort);

            request({
                url: 'http://localhost:' + serverPort + '/services/service/endpoint/||?foo=bar',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/endpoint/%7C%7C?foo=bar');

                done();
            });
        });

        afterEach(closeAll);
    });

    describe('#initialization via constructor using basePath', function () {

        beforeEach(initAll);

        it('should correct proxy requests after initialization', function (done) {
            var proxy = serviceProxy.createProxyInstance(server, 'service', 'http://localhost:' + servicePort, {
                basePath: 'proxy/service'
            });

            request({
                url: 'http://localhost:' + serverPort + '/proxy/service/endpoint',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/endpoint');

                done();
            });
        });

        afterEach(closeAll);
    });

    describe('#cache feature', function () {
        var originalCache, spy;

        beforeEach(function(done) {
            initAll(function () {
                var proxy = serviceProxy.createProxyInstance(server, 'service', 'http://localhost:' + servicePort, {
                    cache: true
                });

                spy = sinon.spy();
                originalCache = serviceProxy.__get__('cache');

                serviceProxy.__set__('cache', {
                    set: spy,
                    get: sinon.stub().callsArg(1)
                });
                done();
            });
        });

        it('should store 200 responces into cache', function (done) {
            request({
                url: 'http://localhost:' + serverPort + '/services/service/endpoint',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/endpoint');

                expect(spy.called).to.eql(true);

                var args = spy.args[0];

                expect(args[0]).to.eql('/endpoint');
                expect(args[1]).to.eql(JSON.stringify(body));

                done();
            });
        });

        it('should not store 300+ responces into cache', function (done) {
            request({
                url: 'http://localhost:' + serverPort + '/services/service/error',
                json: true
            }, function (err, resp) {
                expect(err).to.eql(null);

                expect(resp.statusCode).to.eql(300);

                expect(spy.callCount).to.eql(0);

                done();
            });
        });

        afterEach(function(done) {
            closeAll(function () {
                serviceProxy.__set__('cache', originalCache);
                done();
            });
        });
    });

    describe('#initialization with different cutomizations', function () {

        beforeEach(initAll);

        it('should correct proxy requests with auth headers', function (done) {
            addService({
                href: 'http://localhost:' + servicePort + '/testpath',
                cache: false
            });

            request({
                url: 'http://localhost:' + serverPort + '/services/service/test',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/testpath/test');
                expect(body.headers.authorization).to.eql('Bearer ' + accessToken);

                done();
            });
        });

        it('should correct proxy requests without auth headers', function (done) {
            addService({
                href: 'http://localhost:' + servicePort + '/testpath',
                cache: false,
                authorize: false
            });

            request({
                url: 'http://localhost:' + serverPort + '/services/service/test',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/testpath/test');
                expect(body.headers.authorization).not.to.exist;

                done();
            });
        });

        it('should correct proxy requests with customized headers', function (done) {
            addService({
                href: 'http://localhost:' + servicePort + '/testpath',
                cache: false,
                headers: {
                    'user-agent': 'TestUserAgent'
                }
            });

            request({
                url: 'http://localhost:' + serverPort + '/services/service/test',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/testpath/test');
                expect(body.headers['user-agent']).to.eql('TestUserAgent');

                done();
            });
        });

        it('should correct proxy requests with customized query parameters', function (done) {
            addService({
                href: 'http://localhost:' + servicePort + '/testpath',
                cache: false,
                query: {
                    'page': '123'
                }
            });

            request({
                url: 'http://localhost:' + serverPort + '/services/service/test',
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('GET');
                expect(body.url).to.eql('/testpath/test?page=123');

                done();
            });
        });

        it('should correct proxy requests with customized body', function (done) {
            addService({
                href: 'http://localhost:' + servicePort + '/testpath',
                cache: false,
                body: {
                    'name': 'kitten'
                }
            });

            request({
                method: 'POST',
                url: 'http://localhost:' + serverPort + '/services/service/test',
                body: {
                    id: 3
                },
                json: true
            }, function (err, resp, body) {
                expect(err).to.eql(null);

                expect(body.method).to.eql('POST');
                expect(body.url).to.eql('/testpath/test');
                expect(body.body.id).to.eql(3);
                expect(body.body.name).to.eql('kitten');

                done();
            });
        });

        it('should should send 503 status if service is not available', function (done) {
            service.httpServer.close(function() {
                service.httpServer = null;

                addService({
                    href: 'http://localhost:' + servicePort + '/testpath',
                    cache: false
                });

                request({
                    method: 'GET',
                    url: 'http://localhost:' + serverPort + '/services/service/test',
                    json: true
                }, function (err, resp, body) {
                    expect(err).not.to.exist;
                    expect(resp).to.exist;

                    expect(resp.statusCode).to.eql(503);

                    done();
                });
            });
        });

        afterEach(closeAll);
    });

});
