/*global describe, it, beforeEach, afterEach: true*/
'use strict';

var util = require('util');
var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');
var async = require('async');
var _ = require('lodash');

describe('Notification', function () {
    var Notification = rewire('../../krot').notification;
    var notifications = [];

    var createNotification = function(options) {
        options = options || {};
        var notification = new Notification(_.extend({
            name: 'wmgnotification',
            url: 'amqp://rabbitmq.dspdev.wmg.com', //'amqp://rabbitmq.dspdev.wmg.com', 'amqp://dev.rabbitmq.com', 'amqp://localhost'
            owner: true
        }, options));
        notifications.push(notification);
        return notification;
    };

    var destroyNotifications = function(done) {
        async.series(_.map(notifications, function(notification){
            return function(next) {
                notification.close();
                notification.on('close', next.bind(null, null));
            };
        }), done);
        notifications = [];
    };

    beforeEach(destroyNotifications);
    afterEach(destroyNotifications);

    it('#connect should connect to rabbitMQ server', function (done) {

        var notification = createNotification();

        var onConnect = function() {
            expect(notification._connection).not.to.eql(null);
            expect(notification._connection).to.be.an('object');
            expect(notification._channel).not.to.eql(null);
            expect(notification._channel).to.be.an('object');
            expect(notification._connected).to.eql(true);
            done();
        };

        if (notification.connected()) {
            onConnect();
        } else {
            notification.on('connect', onConnect);
        }
    });

    it('#close should close the rabbitMQ connection', function (done) {

        var notification = createNotification();

        var onConnect = function() {
            notification.close();
            expect(notification._connection).to.eql(null);
            expect(notification._channel).to.eql(null);
            expect(notification._connected).to.eql(false);
            done();
        };

        if (notification.connected()) {
            onConnect();
        } else {
            notification.on('connect', onConnect);
        }
    });

    it('#publish should call callback in "confirmation" mode', function (done) {

        var notification = createNotification({ confirm: true });

        notification.publish({}, '', function() {
            done();
        });
    });

    it('#publish should send a message to the rabbitMQ queue', function (done) {

        var testName = 'testName1', testMessage = { text: 'testMessage1'};

        var notification = createNotification();

        var onSubscribe = function(msg) {
            expect(msg).to.be.an('object');
            expect(msg).to.have.property('text');
            expect(msg.text).not.to.eql(null);
            expect(msg.text).to.eql(testMessage.text);
            notification.unsubscribe(testName);
            done();
        };

        notification.subscribe(testName, onSubscribe);
        notification.on('subscribe', function() {
            notification.publish(testMessage);
        });
    });

    it('#subscribe should receive a message from the rabbitMQ queue', function (done) {

        var testName = 'testName2', testMessage = { text: 'testMessage2'}, counter = 0;

        var notification = createNotification();
        var subscriber1 = createNotification(), subscriber2 = createNotification();

        var onSubscribe = function(msg) {
            expect(msg).to.be.an('object');
            expect(msg).to.have.property('text');
            expect(msg.text).not.to.eql(null);
            expect(msg.text).to.eql(testMessage.text);
            if (--counter < 1) {
                subscriber1.unsubscribe(testName);
                subscriber2.unsubscribe(testName);
                done();
            }
        };

        var onConnect = function() {
            if (++counter < 2) {
                return;
            }
            notification.publish(testMessage);
        };

        subscriber1.subscribe(testName, onSubscribe);
        subscriber2.subscribe(testName, onSubscribe);

        [subscriber1, subscriber2].forEach(function(notification){
            notification.on('subscribe', onConnect);
        });
    });

    it('#subscribe should wait for ack in "acknowledgement" mode', function (done) {

        var testName = 'testName3', testMessage = { text: 'testMessage3'}, counter = 0, ackCalled = false;

        var notification = createNotification();

        var onSubscribe = function(msg, ack) {
            expect(msg).to.be.an('object');
            expect(msg).to.have.property('text');
            expect(msg.text).not.to.eql(null);
            expect(msg.text).to.eql(testMessage.text);
            if (++counter < 2){
                notification.publish(testMessage);
                setTimeout(function(){
                    ackCalled = true;
                    ack();
                }, 3000);
            } else {
                expect(ackCalled).to.eql(true);
                notification.unsubscribe(testName);
                done();
            }
        };

        notification.subscribe(testName, onSubscribe);
        notification.on('subscribe', function() {
            notification.publish(testMessage);
        });
    });

    it('#subscribe should use routing key to filter messages', function (done) {

        var testName = 'testName4', testMessage1 = { text: '1_testMessage4'}, testMessage2 = { text: '2_testMessage4'}, counter = 0;

        var notification = createNotification({ type: 'topic' });
        var subscriber1 = createNotification({ type: 'topic' }), subscriber2 = createNotification({ type: 'topic' });

        var onSubscribe = function (template) { 
            return function(msg) {
                expect(msg).to.be.an('object');
                expect(msg).to.have.property('text');
                expect(msg.text).not.to.eql(null);
                expect(msg.text).to.eql(template.text);
                if (--counter < 1) {
                    subscriber1.unsubscribe(testName);
                    subscriber2.unsubscribe(testName);
                    done();
                }
            };
        };

        var onConnect = function() {
            if (++counter < 2) {
                return;
            }
            notification.publish(testMessage1, '1');
            notification.publish(testMessage2, '2');
        };

        subscriber1.subscribe(testName, '1', onSubscribe(testMessage1));
        subscriber2.subscribe(testName, '2', onSubscribe(testMessage2));

        [subscriber1, subscriber2].forEach(function(notification){
            notification.on('subscribe', onConnect);
        });
    });

    it('#subscribe should support distributed mode (for working queues)', function (done) {

        var testName = 'testName5', testMessage1 = { text: '1_testMessage5'}, testMessage2 = { text: '2_testMessage5'};

        var notification = createNotification({ distributed: true, confirm: true });
        var subscriber1 = createNotification({ distributed: true, confirm: true }), subscriber2 = createNotification({ distributed: true, confirm: true });

        var onSubscribe1 = function(msg) {
            expect(msg).to.be.an('object');
            expect(msg).to.have.property('text');
            expect(msg.text).not.to.eql(null);
            expect(msg.text).to.eql(testMessage1.text);            
        };

        var onSubscribe2 = function(msg) {
            expect(msg).to.be.an('object');
            expect(msg).to.have.property('text');
            expect(msg.text).not.to.eql(null);
            expect(msg.text).to.eql(testMessage2.text);

            subscriber1.unsubscribe(testName);
            subscriber2.unsubscribe(testName);
            done();
        };

        var onConnect = function() {
            notification.publish(testMessage1, '', function() {
                notification.publish(testMessage2);
            });
        };

        subscriber1.subscribe(testName, onSubscribe1);
        subscriber1.on('subscribe', function() {
            subscriber2.subscribe(testName, onSubscribe2);
            subscriber2.on('subscribe', onConnect);
        });
    });

    it('#unsubscribe should disconnect callback from the rabbitMQ queue', function (done) {

        var testName = 'testName6', testMessage = { text: 'testMessage6'}, counter = 0, invokeUnsubscribed = false;

        var notification = createNotification();
        var subscriber1 = createNotification(), subscriber2 = createNotification();

        var onSubscribe1 = function(msg) {
            expect(msg).to.be.an('object');
            expect(msg).to.have.property('text');
            expect(msg.text).not.to.eql(null);
            expect(msg.text).to.eql(testMessage.text);

            setTimeout(function(){
                expect(invokeUnsubscribed).to.eql(false);
                subscriber1.unsubscribe(testName);
                done();
            }, 3000);
        };

        var onSubscribe2 = function(msg) {
            invokeUnsubscribed = true;
        };

        var onConnect = function() {
            if (++counter < 2) {
                return;
            }
            subscriber2.unsubscribe(testName);
            notification.publish(testMessage);
        };

        subscriber1.subscribe(testName, onSubscribe1);
        subscriber2.subscribe(testName, onSubscribe2);

        [subscriber1, subscriber2].forEach(function(notification){
            notification.on('subscribe', onConnect);
        });
    });

});
