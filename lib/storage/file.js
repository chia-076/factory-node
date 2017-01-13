'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var rimraf = require('rimraf');
var util = require('util');
var async = require('async');
var uuid = require('node-uuid');
var _ = require('lodash');

var _defaultStorage = null;

/**
 * Temporal file storage with auto-cleanup functionality and UUID support
 * 
 * Can be used for asynchronous server-side processing of user files or 
 * other use-cases which do NOT require the permanent storage.
 * 
 * All the files in this storage will be removed after specific period of time.
 *
 * Please, use the "object-storage" service if you just need to store the user data
 * and do not need to process this data before storing.
 * 
 * options.cleanupTimeout {Numeric} - the cleanup timeout in milliseconds (TTL for files), default - 1 hour
 * options.initCallback {Function} - the callback which is called when the storage is ready to use, signature - "function(error)"
 * options.default {Boolean} - set this storage object as default, if not passed - the first storage object will be default
 * 
 * @param {String} folder
 * @param {Object} options
 */
function FileStorage (folder, options) {
    options = options || {};

    this._folder = folder;
    this._cleanupTimeout = options.cleanupTimeout || (60 * 60 * 1000);
    this._cleanupStamp = null;
    this._timer = null;
    this._initialized = false; 
    this._cleanup = false;

    if (!this._folder) {
        throw new Error('Base folder is undefined');
    }
    this._init(options.initCallback);

    if (options.default || !_defaultStorage && options.default !== false) {
        _defaultStorage = this;
    }
}

/**
 * Initializes internal data. For internal use only
 * 
 * @param {Function} callback
*/
FileStorage.prototype._init = function (callback) {
    var that = this;
    var complete = function(err) {
        that._initialized = true;
        if (callback) {
            callback(err);
        }
    };
    if (that._initialized) {
        return complete();
    }
    fs.exists(that._folder, function(exists) {
       if (exists) {
           return that._setupTimer(complete);
       }
       fs.mkdir(that._folder, function(err) {
           if (err) {
               return complete(err);
           }
           that._setupTimer(complete);
       });
    });
};

/**
 * Gets the full path. For internal use only
 * 
 * @param {String} id
*/
FileStorage.prototype._fullPath = function(id) {
    return path.join(this._folder, id);
};

/**
 * Setups cleanup timer. For internal use only
 *
 * @param {Function} callback
*/
FileStorage.prototype._setupTimer = function (callback) {
    var that = this;
    if (that._timer) {
        clearTimeout(that._timer);
        that._timer = null;
    }
    var setup = function() {
        that._timer = setTimeout(function(){
            that._cleanupFiles(function(){
                that._setupTimer();
            });
        }, that._cleanupTimeout);
        if (callback) {
            callback();
        }
    };
    if (callback) {
        return that._cleanupFiles(true, setup);
    }
    setup();
};

/**
 * Cleanups files. For internal use only
 * 
 * @param {Boolean} force
 * @param {Function} callback
*/
FileStorage.prototype._cleanupFiles = function (force, callback) {
    var that = this;
    if(typeof force === 'function') {
        callback = force;
        force = false;
    }
    that._cleanup = true;
    var complete = function() {
        that._cleanupStamp = new Date();
        that._cleanup = false;
        if (callback) {
            callback();
        }
    };
    fs.readdir(that._folder, function(err, dirs) {
        if (err) {
            return complete();
        }
        if (!dirs || !dirs.length) {
            return complete();
        }
        that._cleanupSubDirs(dirs, force, complete);
    });
};

/**
 * Cleanups sub-directories. For internal use only
 * 
 * @param {String|Array} dirs
 * @param {Boolean} force
 * @param {Function} callback
*/
FileStorage.prototype._cleanupSubDirs = function (dirs, force, callback) {
    var that = this;
    if (!util.isArray(dirs)) {
        dirs = [dirs];
    }
    async.parallel(_.map(dirs, function(dir) {
        var fullPath = that._fullPath(dir);
        return function(done) {
            if (force) {
                return rimraf(fullPath, done);
            }
            fs.stat(fullPath, function(err, stats){
                if (err) {
                    return done(err);
                }
                if (!that._cleanupStamp || (that._cleanupStamp - stats.ctime) > that._cleanupTimeout) {
                    return rimraf(fullPath, done);
                }
                done();
            });
        };
    }), callback);
};

/**
 * Wraps the function. For internal use only
 * 
 * @param {Function} callback
*/
FileStorage.prototype._wrap = function (callback) {
    var that = this;
    if (that._cleanup) {
        return setTimeout(that._wrap.bind(that, callback), 500);
    }
    callback();
};

/**
 * Creates write stream
 * 
 * @param {String} filename
 * @param {Function} callback
*/
FileStorage.prototype.createWriteStream = function(fileName, callback) {
    var that = this;
    // No need to "_wrap" since it is already wrapped
    that.createPath(function(err, pathInfo) {
        if (err) {
            return callback(err);
        }
        var id = pathInfo.id, filePath = pathInfo.path;
        var stream = null, fullPath = path.join(filePath, fileName);
        try {
            stream = fs.createWriteStream(fullPath);
        } catch (error) {
            err = error;
        }
        callback(err, { stream: stream, id: id, dir: filePath, name: fileName, path: fullPath });
    });
};

/**
 * Creates read stream
 * 
 * @param {String} id
 * @param {Function} callback
*/
FileStorage.prototype.createReadStream = function(id, callback) {
    var that = this;
    // No need to "_wrap" since it is already wrapped
    that.getFilePath(id, function(err, file) {
        if (err) {
            return callback(err);
        }
        var stream = null;
        try {
            stream = fs.createReadStream(file.path);
        } catch (error) {
            err = error;
        }
        callback(err, _.extend(file, { stream: stream }));
    });
};

/**
 * Gets the file path
 * 
 * @param {String} id
 * @param {Function} callback
*/
FileStorage.prototype.getFilePath = function(id, callback) {
    var that = this;
    that._wrap(function() {
        var filePath = that._fullPath(id);
        fs.readdir(filePath, function(err, files) {
            if (err) {
                return callback(err);
            }
            if (!files && !files.length) {
                return callback(new Error ('Cannot find file with id - ' + id));
            }
            var fileName = files[0], fullPath = path.join(filePath, fileName);
            callback(err, { id: id, dir: filePath, name: fileName, path: fullPath });
        });
    });
};

/**
 * Creates the path
 * 
 * @param {Function} callback
*/
FileStorage.prototype.createPath = function(callback) {
    var that = this;
    that._wrap(function() {
        var id = uuid.v4(), filePath = that._fullPath(id);
        fs.mkdir(filePath, function(err) {
            if (err) {
                return callback(err);
            }
            callback(err, { id: id, path: filePath });
        });
    });
};

/**
 * Gets the path
 * 
 * @param {String} id
 * @param {Function} callback
*/
FileStorage.prototype.getPath = function(id, callback) {
    var that = this;
    that._wrap(function() {
        var fullPath = that._fullPath(id);
        fs.exists(fullPath, function(exists) {
            if (!exists) {
                fullPath = null;
            }
            callback(null, fullPath);
        });
    });
};

/**
 * Removes files
 * 
 * @param {String|Array} ids
 * @param {Function} callback
*/
FileStorage.prototype.removeFiles = function(ids, callback) {
    var that = this;
    that._wrap(function() {
        that._cleanupSubDirs(ids, true, callback);
    });
};

/**
 * Returns the default storage
 */
FileStorage.default = function() {
    if (!_defaultStorage) {
        _defaultStorage = new FileStorage(path.join(os.tmpdir(), uuid.v4()));
    }
    return _defaultStorage;
};

module.exports = FileStorage;

