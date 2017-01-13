/*global describe, it, beforeEach, afterEach: true*/
'use strict';

var expect = require('chai').expect;
var rewire = require('rewire');
var uuid = require('node-uuid');
var _ = require('lodash');

var EventEmitter = require('events').EventEmitter;

describe('Channel', function () {
    var Channel = rewire('../../krot').channel;
    var channel = null, io = null, socket = null;

    var createChannel = function() {
        io = new EventEmitter();
        channel = new Channel(io, {
            name: 'wmgchannel',
            url: 'amqp://rabbitmq.dspdev.wmg.com', //'amqp://rabbitmq.dspdev.wmg.com', 'amqp://dev.rabbitmq.com', 'amqp://localhost'
            type: 'direct',
            owner: true
        });
        channel.on('error', function(err) {
            //console.log(err);
        });
        socket = _.assign(Object.create(new EventEmitter()), {
            id: uuid.v4(),
            connected: true,
        });
        io.emit('connection', socket);
    };

    var destroyChannel = function(done) {
        channel._notification.close();
        channel._notification.on('close', function() {
            channel.removeAllListeners();
            channel = null;
            socket = null;
            io = null;
            done();
        });
    };

    beforeEach(createChannel);
    afterEach(destroyChannel);

    it('#start should start receiving messages', function (done) {

        var eventStartCalled = false, eventReceiveCalled = false;
        var target = 'testTarget1', info = 'testInfo1';
        channel.on('start', function(data) {
            eventStartCalled = true;
            expect(data).not.to.eql(null);
            expect(data).to.be.an('object');
            expect(data.cancel).to.eql(false);
            expect(data).to.have.property('message');
            expect(data.message).to.be.an('object');
            expect(data.message).to.have.property('id');
            expect(data.message.id).to.eql(socket.id);
            expect(data.message).to.have.property('target');
            expect(data.message.target).to.eql(target);
        });
        channel.on('receive', function(data) {
            eventReceiveCalled = true;
            expect(data).not.to.eql(null);
            expect(data).to.be.an('object');
            expect(data.cancel).to.eql(false);
            expect(data).to.have.property('message');
            expect(data.message).to.be.an('object');
            expect(data.message).to.have.property('id');
            expect(data.message.id).to.eql(socket.id);
            expect(data.message).to.have.property('target');
            expect(data.message.target).to.eql(target);
            expect(data.message).to.have.property('info');
            expect(data.message.info).to.eql(info);
        });
        socket.on(channel._eventReceive, function(i, t) {
            expect(eventReceiveCalled).to.eql(true);
            expect(t).to.eql(target);
            expect(i).to.eql(info);
            done();
        });
        channel._notification.on('subscribe', function() {
            socket.emit(channel._eventSend, { info: info, target: target });
        });
        socket.emit(channel._eventStart, target);
        expect(eventStartCalled).to.eql(true);
    });

    it('#stop should stop receiving messages', function (done) {

        var eventStopCalled = false, secondReceiveCalled = false;
        var target = 'testTarget2', info = 'testInfo2';
        channel.on('stop', function(data) {
            eventStopCalled = true;
            expect(data).not.to.eql(null);
            expect(data).to.be.an('object');
            expect(data.cancel).to.eql(false);
            expect(data).to.have.property('message');
            expect(data.message).to.be.an('object');
            expect(data.message).to.have.property('id');
            expect(data.message.id).to.eql(socket.id);
        });
        socket.once(channel._eventReceive, function(i, t) {
            expect(t).to.eql(target);
            expect(i).to.eql(info);

            socket.emit(channel._eventStop);
            expect(eventStopCalled).to.eql(true);
            socket.on(channel._eventReceive, function() {
                secondReceiveCalled = true;
            });
            socket.emit(channel._eventSend, { info: info, target: target });
            setTimeout(function() {
                expect(secondReceiveCalled).to.eql(false);
                done();
            }, 5000);
        });
        channel._notification.on('subscribe', function() {
            socket.emit(channel._eventSend, { info: info, target: target });
        });
        socket.emit(channel._eventStart, target);
    });

    it('#send should send messages', function (done) {

        var eventSendCalled = false;
        var target = 'testTarget3', info = 'testInfo3';
        channel.on('send', function(data) {
            eventSendCalled = true;
            expect(data).not.to.eql(null);
            expect(data).to.be.an('object');
            expect(data.cancel).to.eql(false);
            expect(data).to.have.property('message');
            expect(data.message).to.be.an('object');
            expect(data.message).to.have.property('info');
            expect(data.message.info).to.eql(info);
            expect(data.message).to.have.property('target');
            expect(data.message.target).to.eql(target);
        });
        socket.on(channel._eventReceive, function(i, t) {
            expect(t).to.eql(target);
            expect(i).to.eql(info);

            done();
        });
        channel._notification.on('subscribe', function() {
            channel.send(info, target);
            expect(eventSendCalled).to.eql(true);
        });
        socket.emit(channel._eventStart, target);
    });

});
