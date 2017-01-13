'use strict';

var connectBusboy = require('connect-busboy');

var FileStorage = require('./file');

var addValidation = require('../validation/validation').addValidation;

module.exports = function(fileStorage) {

    return {

        /**
         * Upload file
         * 
         * options.formatter {Function} - prepares result object, 
         *    signature: function ({ id: id, name: name, type: type, uploadDate: uploadDate, size: size })
         * 
         * @param {Object} options (optional)
         */
        uploadFile: function (options) {
            var files = fileStorage || FileStorage.default();
            options = options || {};
            options.formatter = options.formatter || function(fileInfo) {
                return { attachment: fileInfo };
            };
            return [
                connectBusboy(), 
                function(req, res, next) {
                    var fstream;
                    req.pipe(req.busboy);
                    req.busboy.on('error', function (err) {
                        next(err);
                    });
                    req.busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
                        var size = 0;
                        file.pause();
                        files.createWriteStream(filename, function(err, streamInfo) {
                            if (err) {
                                return next(err);
                            }
                            var fileid = streamInfo.id;
                            fstream = streamInfo.stream;
                            file.on('data', function(data) {
                                size = size + data.length;
                            });
                            file.pipe(fstream);
                            fstream.on('error', function (err) {
                                next(err);
                            });
                            fstream.on('close', function () {
                                var now = new Date();
                                var jsonDate = now.toJSON();
                                res.json(options.formatter({
                                        id: fileid,
                                        name: filename,
                                        type: mimetype,
                                        uploadDate: jsonDate,
                                        size: size
                                }));
                            });
                            file.resume();
                        });
                    });
                }
            ];
        },

        /**
         * Download file
         * 
         * options.fileParam {String} - file guid parameter name, default - "file"
         * options.attachment {Boolean} - enables/disables attachment mode, default - "false"
         * 
         * @param {Object} options (optional)
         */
        downloadFile: function (options) {
            var files = fileStorage || FileStorage.default();
            options = options || {};
            options.fileParam = options.fileParam || 'file';
            return [
                addValidation(
                    {from: 'params.' + options.fileParam, rule: 'isUUID'}
                ),
                function(req, res, next) {
                    var fstream;
                    files.createReadStream(req.params[options.fileParam], function(err, streamInfo) {
                        if (err) {
                            return next(err);
                        }
                        res.type(streamInfo.name);
                        if (options.attachment) {
                            res.attachment(streamInfo.name);
                        }
                        fstream = streamInfo.stream;
                        fstream.pipe(res);
                        fstream.on('error', function (err) {
                            next(err);
                        });
                    });
                }
            ];
        },

        /**
         * Remove file
         * 
         * options.fileParam {String} - file guid parameter name, default - "file"
         * 
         * @param {Object} options (optional)
         */
        removeFile: function (options) {
            var files = fileStorage || FileStorage.default();
            options = options || {};
            options.fileParam = options.fileParam || 'file';
            return [
                addValidation(
                    {from: 'params.' + options.fileParam, rule: 'isUUID'}
                ),
                function(req, res, next) {
                    files.removeFiles(req.params[options.fileParam], function(err, streamInfo) {
                        if (err) {
                            return next(err);
                        }
                        res.send(204);
                    });
                }
            ];
        }

    };

};
