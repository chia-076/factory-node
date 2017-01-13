'use strict';

var fs = require('fs');
var async = require('async');
var request = require('request');
var _ = require('lodash');

var FileStorage = require('../../storage/file');

/**
 * Provides incident report API
 *
 * config.helpdeskAppName {String} - helpdesk application name
 * config.helpdeskUserName {UUID} - application id
 * config.helpdeskUserPassword {String} - helpdesk name
 * config.helpdeskUrl {String} - helpdesk URL (optional), default - 'https://warnermusictest.service-now.com'
 *
 * @param {Object} config
 */
function IncidentReport (config) {
    config = config || {};
    this.helpdeskUrl = config.helpdeskUrl || 'https://warnermusictest.service-now.com';
    this.helpdeskAppName = config.helpdeskAppName;
    this.helpdeskUserName = config.helpdeskUserName;
    this.helpdeskUserPassword = config.helpdeskUserPassword;
}


/**
 * Sends the incident report
 *
 * data.description {String} - description
 * data.short_description {String} - short description
 * data.location {String} - location
 * data.impact {String} - impact
 * data.caller_id {String} - user email
 *
 * files.storage {FileStorage} - file storage
 * files.attachments {Array} - list of files identifiers
 *
 * @param {Object} data
 * @param {Object} files
 * @param {Function} callback
 */
IncidentReport.prototype.sendReport = function(data, files, callback) {
    var that = this;
    if (_.isFunction(files)) {
        callback = files;
        files = null;
    }
    request.post({
        url: that.helpdeskUrl + '/incident.do?JSONv2=&sysparm_action=insert',
        body: _.defaults({
            cmdb_ci: that.helpdeskAppName,
            contact_type: 'Application'
        }, data),
        headers: that._getHeaders(),
        json: true,
        strictSSL: false
    }, function(err, res, body) {
        if (err) {
            return callback(err);
        }
        var result = body && body.records && body.records.length && body.records[0];
        if (!result || !result.sys_id) {
            return callback(new Error('Incident Report result has not been provided.'));
        }
        that._sendFiles(result.sys_id, files, function (err) {
            callback(err, {
                status: res.statusCode,
                data: result
            });
        });
    });
};

/**
 * Sends the files for incident report. For internal use only.
 *
 * files.storage {FileStorage} - file storage
 * files.attachments {Array} - list of files identifiers
 *
 * @param {Object} reportId
 * @param {Object} files
 * @param {Function} callback
 */
IncidentReport.prototype._sendFiles = function(reportId, files, callback) {
    var that = this;
    if (!files || !files.attachments || !files.attachments.length) {
        return callback();
    }
    var formTemplate = {
        agent: 'AttachmentCreator',
        topic: 'AttachmentCreator',
        source: 'incident:' + reportId
    };
    var fileStorage = files.storage || FileStorage.default();
    async.series(_.map(files.attachments, function (file) {
        return function (next) {
            async.waterfall([
                fileStorage.getFilePath.bind(fileStorage, file),
                function(fileInfo, next) {
                    fs.readFile(fileInfo.path, function(err, fileData) {
                        next (err, fileInfo, fileData && fileData.toString('base64'));
                    });
                },
                function(fileInfo, fileData, next) {
                    request.post({
                        url: that.helpdeskUrl + '/ecc_queue.do?JSONv2&sysparm_action=insert',
                        body: _.defaults({
                            payload: fileData,
                            name: fileInfo.name
                        }, formTemplate),
                        headers: that._getHeaders(),
                        json: true,
                        strictSSL: false
                    }, function (err, res, body) {
                        if (err) {
                            return next(err);
                        }
                        if (res.statusCode >= 400) {
                            var error = new Error('Cannot attach the file to incident report');
                            error.statusCode = res.statusCode;
                            return next(error);
                        }
                        next(null, {
                            file: file,
                            result: body
                        });
                    });
                }
            ], next);
        };
    }), callback);
};

/**
 * Gets authorization headers. For internal use only.
 */
IncidentReport.prototype._getHeaders = function() {
    return {
        'Authorization': 'Basic ' + new Buffer(this.helpdeskUserName + ':' + this.helpdeskUserPassword).toString('base64')
    };
};

module.exports = IncidentReport;
