'use strict';

var controller = require('./controller');
var Service = require('./service');

/**
 * Registers routes for incident report API
 *
 * config.helpdeskAppName {String} - helpdesk application name
 * config.helpdeskUserName {UUID} - application id
 * config.helpdeskUserPassword {String} - helpdesk name
 * config.helpdeskUrl {String} - helpdesk URL (optional), default - 'https://warnermusictest.service-now.com:433'
 *
 * @param {Object} app
 * @param {Object} config
 */
module.exports.registerRoutes = function(app, config) {
    app.post('/components/incident-report/send', controller(config).sendReport());
};

module.exports.controller = controller;

module.exports.Service = Service;

