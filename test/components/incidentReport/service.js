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

Service.__set__('fs', {
    readFile: function(path, callback) {
        callback(null, path);
    }
});


describe('IncidentReportService', function () {
    var server = null, port = null, service = null, sysid = 'testsysid';

    var initServer = function(done) {
        var app = express();
        server = http.createServer(app);
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
        server.listen(0, function(){
            port = server.address().port;
            service = new Service({
                helpdeskAppName: 'testapp',
                helpdeskUserName: 'testuser',
                helpdeskUserPassword: 'testpass',
                helpdeskUrl: 'http://localhost:' + port
            });
            done();
        });
    };

    beforeEach(initServer);

    afterEach(function(done) {
        server.close(function() {
            server = null;
            port = null;
            service = null;
            done();
        });
    });


    it('#sendReport should send the report', function(done) {

        var testDescription = 'test';

        service.sendReport({ description: testDescription }, function (err, res) {
            expect(err).not.to.exist;
            expect(res).to.exist;
            expect(res).to.be.an('object');
            expect(res.status).to.eql(200);
            expect(res.data.sys_id).to.eql(sysid);
            expect(res.data.url).to.eql('/incident.do?JSONv2=&sysparm_action=insert');
            expect(res.data.method).to.eql('POST');
            expect(res.data.headers.authorization).to.eql(service._getHeaders().Authorization);
            expect(res.data.body).to.eql({
                cmdb_ci: service.helpdeskAppName,
                contact_type: 'Application',
                description: testDescription
            });

            done();
        });
    });

    it('#sendFiles should send the files', function(done) {

        var testFiles = {
            attachments: ['file1', 'file2'],
            storage: {
                getFilePath: function (id, callback) {
                    callback(null, { name: id, path: id });
                }
            }
        };

        service._sendFiles(sysid, testFiles, function (err, res) {
            expect(err).not.to.exist;
            expect(res).to.exist;
            expect(res).to.be.an('array');
            expect(res.length).to.eql(testFiles.attachments.length);

            _.each(testFiles.attachments, function (file, index) {
                expect(res[index].file).to.eql(file);
                var result = res[index].result && res[index].result.records && res[index].result.records[0];
                expect(result).to.exist;
                expect(result.sys_id).to.eql(sysid);
                expect(result.url).to.eql('/ecc_queue.do?JSONv2&sysparm_action=insert');
                expect(result.method).to.eql('POST');
                expect(result.headers.authorization).to.eql(service._getHeaders().Authorization);
                expect(result.body).to.eql({
                    payload: file,
                    name: file,
                    agent: 'AttachmentCreator',
                    topic: 'AttachmentCreator',
                    source: 'incident:' + sysid
                });
            });

            done();
        });
    });
});
