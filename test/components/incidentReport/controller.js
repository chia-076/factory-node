/*global describe, it, beforeEach, afterEach: true*/
'use strict';

var fs = require('fs');
var path = require('path');
var request = require('request');
var express = require('express');
var bodyParser = require('body-parser');
var http = require('http');
var util = require('util');
var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');
var async = require('async');
var _ = require('lodash');

var Service = rewire('../../../lib/components/incidentReport/service');
var controller = rewire('../../../lib/components/incidentReport/controller');

Service.__set__('fs', {
    readFile: function(path, callback) {
        callback(null, path);
    }
});

controller.__set__('Service', Service);


describe('IncidentReportController', function () {
    var server = null, port = null;
    var serverNow = null, portNow = null;
    var helpdeskPath = '/components/incident-report/send', sysid = 'testsysid';

    var config = {
        helpdeskAppName: 'testapp',
        helpdeskUserName: 'testuser',
        helpdeskUserPassword: 'testpass'
    };

    var service = new Service(config);



    var initServerNow = function(done) {
        var app = express();
        serverNow = http.createServer(app);
        app.use(express.static(__dirname));
        app.use(bodyParser.json());
        app.post('/*', function (req, res) {
            res.json({
                records: [
                    {
                        sys_id: sysid,
                        url: req.originalUrl,
                        method: req.method,
                        headers: req.headers,
                        body: req.body
                    }
                ]
            });
        });
        serverNow.listen(0, function(){
            portNow = serverNow.address().port;
            initServer(done);
        });
    };

    var initServer = function(done) {
        var app = express();
        server = http.createServer(app);
        app.use(express.static(__dirname));
        app.use(bodyParser.json());
        app.post(helpdeskPath, controller(_.defaults({
            helpdeskUrl: 'http://localhost:' + portNow
        }, config), {
            getFilePath: function (id, callback) {
                callback(null, { name: id, path: id });
            }
        }).sendReport());
        server.listen(0, function(){
            port = server.address().port;
            done();
        });
    };

    beforeEach(initServerNow);

    afterEach(function(done) {
        server.close(function() {
            server = null;
            port = null;
            serverNow.close(function() {
                serverNow = null;
                portNow = null;
                done();
            });
        });
    });


    it('#sendReport endpoint should send the report', function(done) {

        var testDescription = 'test';
        var testFiles = ['file1', 'file2'];

        request.post({
            url: 'http://localhost:' + port + helpdeskPath,
            body: {
                short_description: testDescription,
                impact: 3,
                attachments: testFiles
            },
            json: true
        }, function (err, resp, body) {
            expect(err).not.to.exist;
            expect(resp.statusCode).to.eql(200);
            expect(body).to.exist;
            expect(body).to.be.an('object');
            expect(body.sys_id).to.eql(sysid);
            expect(body.url).to.eql('/incident.do?JSONv2=&sysparm_action=insert');
            expect(body.method).to.eql('POST');
            expect(body.headers.authorization).to.eql(service._getHeaders().Authorization);
            expect(body.body).to.eql({
                cmdb_ci: config.helpdeskAppName,
                contact_type: 'Application',
                short_description: testDescription,
                impact: '3'
            });

            done();
        });
    });

});
