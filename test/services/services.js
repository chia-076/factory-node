/*global describe, it, beforeEach: true*/
'use strict';

var expect = require('chai').expect;
var rewire = require('rewire');


var services = rewire('../../lib/services/services');

describe('#getService', function () {

    var VCAP_SERVICES = {
        'fooBar-v1_222': [{
            name: 'foo',
            label: 'fooBar-v1_222',
            plan: 'free'
        }]
    };
    process.env.VCAP_SERVICES = JSON.stringify(VCAP_SERVICES);


    it('should return null if we isnt in the cloud', function () {
        services.__set__('cloudfoundry', {cloud: false});
        var service = services.getService('foo');

        expect(service).to.eql(null);
    });

    it('should return service if it exists and put it to cache', function () {
        services.__set__('cloudfoundry', {cloud: true});

        var service = services.getService('fooBar');

        expect(service.name).to.eql('foo');

        var cachedService = services.__get__('serviceCache');

        expect(cachedService.foobar).to.eql({
            name: 'foo',
            label: 'fooBar-v1_222',
            plan: 'free'
        });
    });

    it('should return service by name if it exists and put it to cache', function () {
        services.__set__('cloudfoundry', {cloud: true});

        var service = services.getServiceByName('foo');

        expect(service.label).to.eql('fooBar-v1_222');

        var cachedService = services.__get__('serviceCache');

        expect(cachedService.foobar).to.eql({
            name: 'foo',
            label: 'fooBar-v1_222',
            plan: 'free'
        });
    });

    it('should return null if there is no such service', function () {
        services.__set__('cloudfoundry', {cloud: true});

        var service = services.getService('barFoo');

        expect(service).to.eql(null);

    });

});