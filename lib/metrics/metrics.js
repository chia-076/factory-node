'use strict';

var _ = require('lodash');
var StatsD = require('node-statsd').StatsD;
var EventEmitter = require('events').EventEmitter;

var metrics = Object.create(new EventEmitter());

var metricsEnabled = false;

var client;
var applicationId;
var metricDelimiter;

var MetricItem = function(key) {
    var _fullKey = applicationId + metricDelimiter + key;
    var _startTime = Date.now();

    this.flush = function() {
        client.timing(_fullKey, Date.now() - _startTime);
    }
};

var MetricItemDisabled = function() {
    this.flush = function() { /* do nothing */ };
};

module.exports = _.assign(metrics, {
    /**
     * Initializes metrics module.
     *
     * @param metricsConfig - object: metrics: {
     *     enabled: true/false,
     *     applicationId: appName + '---' + appUrl,
     *     delimiter: '---',
     *     serverHost: '54.84.57.167',
     *     serverPort: 8125
     * }
     */
    initMetrics: function(metricsConfig) {
        metricsEnabled = metricsConfig.enabled;
        if (metricsEnabled) {

            applicationId = metricsConfig.applicationId;
            metricDelimiter = metricsConfig.delimiter;

            client = new StatsD({
                host: metricsConfig.serverHost,
                port: metricsConfig.serverPort
            });
            client.socket.on('error', function (error) {
                return console.error("Error in Metrics socket connection: ", error);
            });
        }
    },

    /**
     * Wraps a function with metrics
     * @param key metric id
     * @param {Function} action
     * @returns {Function}
     */
    wrapWithMetrics: function (key, action) {
        if (metricsEnabled) {
            var metric = this.openMetric(key);

            action.apply(this);

            metric.count();

        } else {
            action.apply(this);
        }
    },

    openMetric: function(key) {
        if (metricsEnabled) {
            return new MetricItem(key);

        } else {
            return new MetricItemDisabled();
        }
    }
});

