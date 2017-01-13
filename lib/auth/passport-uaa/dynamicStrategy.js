'use strict';

var BaseStrategy = require('passport').Strategy;
var util = require('util');
var _ = require('lodash');

/**
 * Dynamic Passport Strategy.
 *
 * @param {Function} handler
 *
 * @constructor
 */
var Strategy = function (handler) {
    Strategy.super_.call(this);
    this._strategyCreator = handler;
};

util.inherits(Strategy, BaseStrategy);

/**
 * Authenticate request.
 *
 * @param {Object} req
 * @param {Object} options
 */
Strategy.prototype.authenticate = function(req, options) {
    var realStrategy = this._strategyCreator(req, options);
    _.assign(realStrategy, this);
    realStrategy.authenticate(req, options);
};

module.exports = Strategy;
