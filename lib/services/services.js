'use strict';
var cloudfoundry = require('cloudfoundry');
var _ = require('lodash');
var serviceCache = {};

/**
 * returns cloudfoundry service by service by label or even by part of it
 * 
 * @param  {String} serviceName
 * @return {Object}
 */
exports.getService = function (serviceName) {
    if (!cloudfoundry.cloud) {
        return null;
    }

    serviceName = serviceName.toLowerCase();

    if (serviceCache[serviceName]) {
        return serviceCache[serviceName];
    }

    var services = JSON.parse(process.env.VCAP_SERVICES);
    var service = _.first(_.find(services, function (service, name) {
        return name.toLowerCase().indexOf(serviceName) >= 0;
    }));

    if (service) {
        serviceCache[serviceName] = service;
    }

    return service || null;
};

/**
 * returns cloudfoundry service by name
 * @param {String} name
 * @returns {Object}
 */
exports.getServiceByName = function (name) {
    if (!cloudfoundry.cloud) {
        return null;
    }

    if (serviceCache[name]) {
        return serviceCache[name];
    }

    var services = JSON.parse(process.env.VCAP_SERVICES);
    var result = null;

    _.some(services, function (serviceGroup) {
        var service = _.find(serviceGroup, function (item) {
            return item.name === name;
        });
        if (service) {
            result = service;
            return true;
        }
    });

    if (result) {
        serviceCache[name] = result;
    }

    return result || null;

};

/**
 * return list of all services
 * @return {Object}
 */
exports.getServices = function () {
    if (!cloudfoundry.cloud) {
        return null;
    }

    return JSON.parse(process.env.VCAP_SERVICES);
};