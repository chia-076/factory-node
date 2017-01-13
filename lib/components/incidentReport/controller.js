'use strict';

var Service = require('./service');

var addValidation = require('../../validation/validation').addValidation;

/**
 * Provides incident report API
 *
 * config.helpdeskAppName {String} - helpdesk application name
 * config.helpdeskUserName {UUID} - application id
 * config.helpdeskUserPassword {String} - helpdesk name
 * config.helpdeskUrl {String} - helpdesk URL (optional), default - 'https://warnermusictest.service-now.com:433'
 *
 * @param {Object} config
 * @param {Object} fileStorage (optional)
 */
module.exports = function(config, fileStorage) {

    var service = new Service(config);

    return {

        /**
         * Sends incident report
         *
         * options.formatter {Function} - prepares result object,
         *    signature: function (originalData)
         *
         * options.longDescriptionParam {String} - long description parameter name, default - 'long_description'
         * options.shortDescriptionParam {String} - short description parameter name, default - 'short_description'
         * options.locationParam {String} - location parameter name, default - 'location'
         * options.impactParam {String} - impact parameter name, default - 'impact'
         * options.attachmentsParam {String} - attachments parameter name, default - 'attachments'
         *
         * @param {Object} options (optional)
         */
        sendReport: function (options) {
            options = options || {};
            var longDescriptionParam = options.longDescriptionParam || 'long_description';
            var shortDescriptionParam = options.shortDescriptionParam || 'short_description';
            var locationParam = options.locationParam || 'location';
            var impactParam = options.impactParam || 'impact';
            var attachmentsParam = options.attachmentsParam || 'attachments';
            var formatter = options.formatter || function(originalData) {
                return originalData;
            };
            return [
                addValidation(
                    {from: 'body.' + shortDescriptionParam},
                    {from: 'body.' + impactParam}
                ),
                function(req, res, next) {
                    var userData = req._passport && req._passport.session && req._passport.session.user || {};
                    service.sendReport({
                        description: req.body[longDescriptionParam],
                        short_description: req.body[shortDescriptionParam],
                        location: req.body[locationParam],
                        impact: req.body[impactParam].toString(),
                        caller_id: userData.email
                    }, {
                        storage: fileStorage,
                        attachments: req.body[attachmentsParam]
                    }, function(err, result) {
                        if (err) {
                            return next (err);
                        }
                        res.status(result.status).json(formatter(result.data));
                    });
                }
            ];
        }
    };

};
