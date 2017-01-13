/*global describe, it, beforeEach: true*/
'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');

var _ = require('lodash');

var app;
var verify;
var passport;


describe('auth', function () {
    var auth = require('../../krot').auth;
    it('should have Authentication, Strategy constructors and ensureAuthenticated', function () {
        expect(auth).to.have.property('Authentication');
        expect(auth).to.have.property('Strategy');
        expect(auth).to.have.property('ensureAuthenticated');

        expect(auth.Authentication).to.be.a('Function');
        expect(auth.Strategy).to.be.a('Function');
    });

    it('Authentication instanse should have use and ensureAuthenticated functions', function () {
        var authProvider = new auth.Authentication({}, {}, function () {});

        expect(authProvider).to.have.property('use');
        expect(authProvider.use).to.be.a('Function');

        expect(authProvider).to.have.property('ensureAuthenticated');
        expect(authProvider.ensureAuthenticated).to.be.a('Function');
    });


});
describe('authentication.Authentication', function () {
    var authentication = rewire('../../lib/auth/authentication');
    var auth;

    beforeEach(function () {
        app = {
            use: sinon.spy(),
            get: sinon.spy()
        };

        verify = sinon.spy();

        passport = {
            use: sinon.spy(),
            serializeUser: sinon.spy(),
            deserializeUser: sinon.spy(),
            initialize: sinon.stub(),
            session: sinon.stub()
        };

        authentication.__set__('passport', passport);

        auth = new authentication.Authentication(app, verify);
    });


    it('#use should create options and invoke passport methods', function () {
        var strategy = sinon.spy();
        auth.setStrategy(strategy);

        auth.makeRoutes = sinon.spy();

        var options = {
            clientId: 'foo',
            clientSecret: 'bar',
            url: 'foo/bar',
            noContentSniff: false,
            frameOptions: false,
            xssProtection: false,
            contentSecurityPolicy: {
                "script-src": "'self'"
            },
            csrfProtection: true,
            transportSecurity: true
        };

        passport.initialize.returns('someInitValue');
        passport.session.returns('someSessionValue');

        auth.use(options);

        expect(strategy.called).to.eql(true);

        expect(passport.use.called).to.eql(true);
        expect(passport.serializeUser.called).to.eql(true);
        expect(passport.deserializeUser.called).to.eql(true);

        expect(passport.initialize.called).to.eql(true);
        expect(passport.session.called).to.eql(true);

        var authOptions = auth.getAuthOptions();

        expect(authOptions).to.eql({
            callbackURL: '/auth/callback',
            clientID: options.clientId,
            clientSecret: options.clientSecret,
            uaaUrl: options.url,
            noContentSniff: options.noContentSniff,
            frameOptions: options.frameOptions,
            xssProtection: options.xssProtection,
            contentSecurityPolicy: options.contentSecurityPolicy,
            csrfProtection: options.csrfProtection,
            transportSecurity: options.transportSecurity
        });

        expect(app.use.getCall(1).args[0]).to.eql('someInitValue');
        expect(app.use.getCall(2).args[0]).to.eql('someSessionValue');
    });


    it('#getAuthOptions / #setAuthOptions should support options callback', function () {

        var options = {
            callbackURL: '/test/callback',
            clientId: 'foo1',
            clientSecret: 'bar1',
            url: 'foo1/bar1',
            noContentSniff: true,
            frameOptions: true,
            xssProtection: true,
            contentSecurityPolicy: {
                "script-src": "'self'"
            },
            csrfProtection: false,
            transportSecurity: false
        };

        auth.setAuthOptions({}, function(req) {
            return options;
        });

        expect(auth.getAuthOptions()).to.eql(_.transform(options, function(result, val, key) {
            switch(key) {
                case 'clientId':
                    key = 'clientID';
                    break;
                case 'url':
                    key = 'uaaUrl';
                    break;
            }
            result[key] = val;
        }));

    });


    it('#ensureAuthenticated should call next if user is authenticated', function () {
        var requst = {
            isAuthenticated: sinon.stub(),
            url: '/'
        };

        requst.isAuthenticated.returns(true);
        var ensureAuthenticated = auth.ensureAuthenticated();

        ensureAuthenticated(requst, {}, function () {
            expect(requst.isAuthenticated.called).to.eql(true);
        });
    });

    it('#ensureAuthenticated should call next if url is unsecure', function () {
        var requst = {
            isAuthenticated: sinon.stub(),
            url: '/foobar'
        };
        auth.addUnsecureUrl('/foobar');
        requst.isAuthenticated.returns(false);
        var ensureAuthenticated = auth.ensureAuthenticated();

        ensureAuthenticated(requst, {}, function () {
            expect(requst.isAuthenticated.called).to.eql(true);
        });

        requst.url = '/foobar/';

        ensureAuthenticated(requst, {}, function () {
            expect(requst.isAuthenticated.called).to.eql(true);
        });
    });


    it('#ensureAuthenticated should redirect on login page if user is new', function () {
        var requst = {
            isAuthenticated: sinon.stub(),
            url: '/',
            method: 'GET'
        };

        requst.isAuthenticated.returns(false);
        var response = {
            redirect: sinon.spy()
        };
        var link = '/foo/bar';

        var createRedirectUrl = sinon.stub();
        createRedirectUrl.returns(link);

        authentication.__set__('createRedirectUrl', createRedirectUrl);

        var ensureAuthenticated = auth.ensureAuthenticated();
        ensureAuthenticated(requst, response, function () {});

        expect(response.redirect.called).to.eql(true);
        expect(response.redirect.getCall(0).args[0]).to.contain(encodeURIComponent(link));
    });

    it('#ensureAuthenticated should returns 401 error if req.method is not GET', function () {
        var requst = {
            isAuthenticated: sinon.stub(),
            url: '/'
        };
        requst.isAuthenticated.returns(false);
        var response = {
            send: sinon.spy()
        };

        var ensureAuthenticated = auth.ensureAuthenticated();
        ensureAuthenticated(requst, response, function () {});

        expect(response.send.called).to.eql(true);
        expect(response.send.getCall(0).args[0]).to.eql(401);
    });

    it('#ensureSecurityHeaders should set all security headers properly by default', function () {
        var request = {
            method: 'POST',
            headers: {}
        };
        var response = {
            set: sinon.spy(),
            locals: {}

        };
        var next = sinon.spy();

        auth.ensureSecurityHeaders()(request, response, next);

        expect(response.set.calledWithMatch(/^x-content-type-options$/i, /^nosniff$/i)).to.eql(true);
        expect(response.set.calledWithMatch(/^x-frame-options$/i, /^sameorigin$/i)).to.eql(true);
        expect(response.set.calledWithMatch(/^x-xss-protection$/i, /^1;\s*mode=block$/i)).to.eql(true);
        expect(response.set.calledWithMatch(/^content-security-policy$/i, /.*/i)).to.eql(false);
        expect(response.set.calledWithMatch(/^strict-transport-security$/i, /.*/i)).to.eql(false);

        expect(response.locals).to.eql({});
        expect(response.statusCode).not.to.exist;
        expect(next.getCall(0).args[0]).not.to.exist;
    });

    it('#ensureSecurityHeaders should set all security headers properly with provided values', function () {
        var request = {
            method: 'POST',
            headers: {},
            session: {}
        };

        request.headers['x-csrf-token'] = auth.generateToken(request, '_csrfSecret');

        var response = {
            set: sinon.spy(),
            locals: {}

        };
        var next = sinon.spy();

        var options = {
            noContentSniff: false,
            frameOptions: 'DENY',
            xssProtection: false,
            contentSecurityPolicy: {
                "script-src": "'self' https://www.google.com",
                "report-uri": "/mail/cspreport"
            },
            csrfProtection: true,
            transportSecurity: {
                maxAge: 6578,
                includeSubDomains: false,
                autoRedirect: false
            }
        };
        auth.ensureSecurityHeaders(options)(request, response, next);

        expect(response.set.calledWithMatch(/^x-content-type-options$/i, /^nosniff$/i)).to.eql(false);
        expect(response.set.calledWithMatch(/^x-frame-options$/i, /^deny$/i)).to.eql(true);
        expect(response.set.calledWithMatch(/^x-xss-protection$/i, /^1;\s*mode=block$/i)).to.eql(false);
        expect(response.set.calledWithMatch(/^content-security-policy$/i,
            /script-src\s*'self' https:\/\/www.google.com;/i)).to.eql(true);
        expect(response.set.calledWithMatch(/^content-security-policy$/i,
            /report-uri\s*\/mail\/cspreport;/i)).to.eql(true);
        expect(response.set.calledWithMatch(/^strict-transport-security$/i,
            /^max-age=6578/i)).to.eql(true);

        expect(response.locals._csrfToken).to.exist;
        expect(response.locals._csrfToken).not.to.eql(request.headers['x-csrf-token']);
        expect(response.statusCode).not.to.exist;
        expect(next.getCall(0).args[0]).not.to.exist;
    });

    it('#ensureSecurityHeaders should configure CSRF protection properly', function () {
        var request = {
            method: 'POST',
            headers: {
                testTokenHeader: 'testOldToken'
            }
        };
        var response = {
            set: sinon.spy(),
            locals: {}

        };
        var next = sinon.spy();

        var options = {
            csrfProtection: {
                tokenKey: 'testTokenKey',
                tokenHeader: 'testTokenHeader',
                secretKey: 'testSecretKey',
                generate: function(req, secretKey) {
                    expect(req).to.eql(request);
                    expect(secretKey).to.eql('testSecretKey');

                    return 'testNewToken';
                },
                validate: function(req, secretKey, token) {
                    expect(req).to.eql(request);
                    expect(secretKey).to.eql('testSecretKey');
                    expect(token).to.eql('testOldToken');

                    return false;
                }
            }
        };
        auth.ensureSecurityHeaders(options)(request, response, next);

        expect(response.locals).to.eql({ testTokenKey: 'testNewToken' });
        expect(response.statusCode).to.eql(403);
        expect(next.getCall(0).args[0]).to.exist;
    });

    it('#ensureSecurityHeaders with HSTS protection should return error for non-GET non-HTTPS requests', function () {
        var request = {
            protocol: 'http',
            method: 'POST',
            connection: {
                encrypted: false
            },
            headers: {}
        };
        var response = {
            set: sinon.spy(),
            locals: {}

        };
        var next = sinon.spy();

        var options = {
            transportSecurity: true
        };
        auth.ensureSecurityHeaders(options)(request, response, next);

        expect(response.set.calledWithMatch(/^strict-transport-security$/i,
            /^max-age=31536000;\s*includeSubDomains$/i)).to.eql(true);

        expect(response.statusCode).to.eql(403);
        expect(next.getCall(0).args[0]).to.exist;
    });

    it('#ensureSecurityHeaders with HSTS protection should redirect automatically for GET non-HTTPS requests', function () {
        var request = {
            get: function(header) {
                if (header === 'host') {
                    return 'localhost:9000';
                }
                return '';
            },
            url: '/test/url?redirect_uri=http%3A%2F%2Fnodehttpsecurity.wmg.com%2F',
            protocol: 'http',
            method: 'GET',
            connection: {
                encrypted: false
            },
            headers: {}
        };
        var response = {
            set: sinon.spy(),
            redirect: sinon.spy(),
            locals: {}
        };
        var next = sinon.spy();

        var options = {
            transportSecurity: true
        };
        auth.ensureSecurityHeaders(options)(request, response, next);

        expect(response.set.calledWithMatch(/^strict-transport-security$/i,
            /^max-age=31536000;\s*includeSubDomains$/i)).to.eql(true);

        expect(response.redirect.calledWithMatch(
            /^https:\/\/localhost:9000\/test\/url\?redirect_uri=https%3A%2F%2Fnodehttpsecurity.wmg.com%2F$/i)).to.eql(true);
    });

    it('#ensureSecurityHeaders with HSTS protection should work normally for HTTPS requests', function () {
        var request = {
            get: function(header) {
                if (header === 'host') {
                    return 'localhost:9000';
                }
                return '';
            },
            url: '/test/url?query=8',
            protocol: 'https',
            method: 'GET',
            connection: {
                encrypted: true
            }
        };
        var response = {
            set: sinon.spy(),
            redirect: sinon.spy(),
            locals: {}
        };
        var next = sinon.spy();

        var options = {
            transportSecurity: true
        };
        auth.ensureSecurityHeaders(options)(request, response, next);

        expect(response.set.calledWithMatch(/^strict-transport-security$/i,
            /^max-age=31536000;\s*includeSubDomains$/i)).to.eql(true);

        expect(response.redirect.calledWithMatch(/.*/i)).to.eql(false);

        expect(response.statusCode).not.to.exist;
        expect(next.getCall(0).args[0]).not.to.exist;
    });

    it('#makeRoutes should assigne routes for /login /logout and /auth/callback', function () {
        auth.makeRoutes();

        expect(app.get.getCall(0).args[0]).to.eql('/login');
        expect(app.get.getCall(1).args[0]).to.eql('/logout');
        expect(app.get.getCall(2).args[0]).to.eql('/auth/callback');

    });

    it('#verifyAuth should fill profile and emit event', function (done) {
        var accessToken = 'someAccessToken';
        var refreshToken = 'someRefreshToken';

        auth.on('successLogin', function (profile) {
            expect(profile.accessToken).to.eql(accessToken);
            expect(profile.refreshToken).to.eql(refreshToken);
            done();
        });

        auth.verifyAuth(accessToken, refreshToken, {}, {}, function () {});
    });

});