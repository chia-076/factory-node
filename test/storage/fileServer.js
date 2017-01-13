/*global describe, it, beforeEach, afterEach: true*/
'use strict';

var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var request = require('request');
var express = require('express');
var http = require('http');
var util = require('util');
var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');
var async = require('async');
var _ = require('lodash');

var File = require('../../krot').file;
var FileServer = require('../../krot').fileServer;

describe('FileServer', function () {
    var tmpDir = path.resolve(__dirname + '/../../teststorage');
    var tmpText = ' Test message 123 !@#$%^&*()_+{}[]<>?\n ---new line';
    var tmpFile = 'tmpfile.txt';
    var file = null, fileServer = null;
    var server = null, port = null;

    var initServer = function(done) {
        var app = express();
        server = http.createServer(app);
        app.use(express.static(__dirname));
        app.post('/files', fileServer.uploadFile());
        app.get('/files/:file', fileServer.downloadFile());
        app.delete('/files/:file', fileServer.removeFile());
        server.listen(0, function(){
            port = server.address().port;
            done();
        });
    };

    var getRoute = function(id) {
        return 'http://localhost:' + port + '/files' + ((id) ? ('/' + id) : (''));
    };

    beforeEach(function(done) {
        file = new File(tmpDir, {
            initCallback: function(err) {
                expect(err).not.to.exist;
                fileServer = FileServer(file);
                initServer(done);
            }
        });
    });

    afterEach(function(done) {
        server.close(function() {
            file = null;
            fileServer = null;
            server = null;
            port = null;
            rimraf(tmpDir, done);
        });
    });

    var writeFile = function (done) {
        file.createWriteStream(tmpFile, function(err, fileInfo){
            expect(err).not.to.exist;
            expect(fileInfo).to.exist;
            expect(fileInfo).to.be.an('object');
            expect(fileInfo.id).to.exist;
            expect(fileInfo.stream).to.exist;
            fileInfo.stream.end(tmpText, 'utf8', function(err){
                expect(err).not.to.exist;
                done(null, fileInfo);
            });
        });
    };

    var uploadFile = function (done) {
        writeFile(function(err, fileInfo1) {
            expect(err).not.to.exist;
            file.createReadStream(fileInfo1.id, function(err, fileInfo2){
                expect(err).not.to.exist;
                expect(fileInfo2).to.exist;
                expect(fileInfo2).to.be.an('object');
                expect(fileInfo2.id).to.exist;
                expect(fileInfo2.stream).to.exist;
                var req = request.post({ url: getRoute(), json: true }, function(err, res, body){
                    expect(err).not.to.exist;
                    expect(body).to.exist;
                    expect(body).to.be.an('object');
                    expect(body.attachment).to.exist;
                    expect(body.attachment).to.be.an('object');
                    expect(body.attachment.id).to.exist;
                    fileInfo2.stream.destroy();
                    checkFile(body.attachment.id, fileInfo2, done);
                });
                var form = req.form();
                form.append('file', fileInfo2.stream);
            });
        });
    };

    var checkFile = function (id, res, done) {
        file.createReadStream(id, function(err, fileInfo){
            expect(err).not.to.exist;
            expect(fileInfo).to.exist;
            expect(fileInfo).to.be.an('object');
            expect(fileInfo.stream).to.exist;
            fileInfo.stream.setEncoding('utf8');
            var fileText = '';
            fileInfo.stream.on('data', function(chunk) {
                fileText += chunk;
            }).on('end', function() {
                expect(fileText).to.eql(tmpText);
                done(null, res);
            }).on('error', function(err) {
                done(err);
            });
        });
    }; 

    it('#uploadFile should upload file', uploadFile);

    it('#downloadFile should download file', function(done) {
        uploadFile(function(err, fileInfo1) {
            expect(err).not.to.exist;
            file.createWriteStream(fileInfo1.id, function(err, fileInfo2){
                expect(err).not.to.exist;
                expect(fileInfo2).to.exist;
                expect(fileInfo2).to.be.an('object');
                expect(fileInfo2.stream).to.exist;
                request.get({ url: getRoute(fileInfo1.id), json: false }, function(err, res, body){
                    expect(err).not.to.exist;
                    expect(body).to.exist;
                    expect(body).to.eql(tmpText);
                    done();
                }).pipe(fileInfo2.stream);
            });
        });
    });

    it('#removeFile should remove file', function(done) {
        uploadFile(function(err, fileInfo1) {
            expect(err).not.to.exist;
            request.del({ url: getRoute(fileInfo1.id), json: false }, function(err, res, body){
                expect(err).not.to.exist;
                file.getPath(fileInfo1.id, function(err, fileInfo2){
                    expect(err).not.to.exist;
                    expect(fileInfo2).not.to.exist;
                    done();
                });
            });
        });
    });

});
