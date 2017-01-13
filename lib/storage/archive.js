'use strict';

var fs = require('fs');
var path = require('path');
var unzip = require('unzip');
var yazl = require('yazl');
var async = require('async');

var FileStorage = require('./file');

/**
 * Archive storage
 * 
 * @param {Object} fileStorage
 */
function ArchiveStorage (fileStorage) {
    this.fileStorage = fileStorage || FileStorage.default();
}

/**
 * Extracts archive
 * 
 * options.normalize - recognizes arrchives with only one subfolder, default - "false"
 * 
 * @param {String} filePath
 * @param {Object} options (optional)
 * @param {Function} callback
*/
ArchiveStorage.prototype.extract = function(filePath, options, callback) {
    var that = this;
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }
    options = options || {};
    that.fileStorage.createPath(function(err, pathInfo) {
        if (err) {
            return callback(err);
        }
        var id = pathInfo.id, pathOut = pathInfo.path;
        var result = { id: id, pathIn: filePath, pathOut: pathOut };
        fs.createReadStream(filePath).pipe(unzip.Extract({ path: pathOut }))
        .on('error', function(err) {
            callback(err);
        })
        .on('close', function() {
            if (!options.normalize) {
                return callback(null, result);
            }
            fs.readdir(pathOut, function(err, files) {
                if (err) {
                    return callback(err);
                }
                if (files && files.length === 1) {
                    var folder = path.join(pathOut, files[0]);
                    fs.stat(folder, function(err, stats) {
                        if (err) {
                            return callback(err);
                        }
                        if (stats.isDirectory()) {
                            result.pathOut = folder;
                        }
                        callback(null, result);
                    });
                } else {
                    callback(null, result);
                }
            });
        });
    });
};

/**
 * Compress data
 * 
 * options.archiveName - setups the output archive name, default - "archive.zip"
 * 
 * @param {String} filePath
 * @param {Object} options (optional)
 * @param {Function} callback
*/
ArchiveStorage.prototype.compress = function(filePath, options, callback) {
    var that = this;
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }
    options = options || {};
    that.fileStorage.createPath(function(err, pathInfo) {
        if (err) {
            return callback(err);
        }
        var id = pathInfo.id, pathOut = path.join(pathInfo.path, options.archiveName || 'archive.zip');
        var result = { id: id, pathIn: filePath, pathOut: pathOut };
        var output = fs.createWriteStream(pathOut);
        var archive = new yazl.ZipFile();
        var error = null;
        output.on('close', function() {
            callback(error, result);
        });
        archive.on('error', function(err) {
            error = error || err;
            callback(error);
        });
        archive.outputStream.pipe(output);
        _readDir(filePath, '', function (fullPath, basePath, stats) {
            if (!stats.isDirectory()) {
                archive.addFile(fullPath, basePath.replace(/\\/g, '/'));
            }
        }, function(err) {
            error = error || err;
            archive.end();
        });
    });
};

/**
 * Reads directory contents (for internal use only)
 *
 * @param {String} readPath
 * @param {String} rootDir
 * @param {Function} handler
 * @param {Function} callback
 */
function _readDir(readPath, rootDir, handler, callback) {
    rootDir = rootDir || '';
    fs.readdir(readPath, function(err, nodes) {
        if (err) {
            return callback(err);
        }
        async.each(nodes, function(node, done) {
            var fullPath = path.join(readPath, node);
            var basePath = path.join(rootDir, node);
            fs.lstat(fullPath, function(err, stats){
                if (err) {
                    return done(err);
                }
                handler(fullPath, basePath, stats);
                if (!stats.isDirectory()) {
                    return done();
                }
                _readDir(fullPath, basePath, handler, done);
            });
        }, callback)
    });
}

module.exports = ArchiveStorage;

