/*global describe, it, beforeEach, afterEach: true*/
'use strict';

var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var util = require('util');
var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');
var async = require('async');
var _ = require('lodash');

var File = require('../../krot').file;

describe('File', function () {
    var tmpDir = path.resolve(__dirname + '/../../teststorage');
    var tmpText = ' Test message 123 !@#$%^&*()_+{}[]<>?\n ---new line';
    var tmpFile = 'tmpfile.txt';
    var file = null;

    beforeEach(function(done) {
        file = new File(tmpDir, {
            initCallback: function(err) {
                expect(err).not.to.exist;
                done();
            }
        });
    });

    afterEach(function(done) {
        file = null;
        rimraf(tmpDir, done);
    });

    var createPath = function (done) {
        file.createPath(function(err, pathInfo){
            expect(err).not.to.exist;
            expect(pathInfo).to.exist;
            expect(pathInfo).to.be.an('object');
            expect(pathInfo.id).to.exist;
            expect(pathInfo.path).to.exist;
            done(err, pathInfo);
        });
    };

    var writeFile = function (done) {
        file.createWriteStream(tmpFile, function(err, fileInfo){
            expect(err).not.to.exist;
            expect(fileInfo).to.exist;
            expect(fileInfo).to.be.an('object');
            expect(fileInfo.name).to.exist;
            expect(fileInfo.name).to.eql(tmpFile);
            expect(fileInfo.id).to.exist;
            expect(fileInfo.stream).to.exist;
            expect(fileInfo.path).to.exist;
            expect(fileInfo.dir).to.exist;
            fileInfo.stream.end(tmpText, 'utf8', function(err){
                expect(err).not.to.exist;
                done(null, fileInfo);
            });
        });
    };

    it('#createPath should create the path for file storage', createPath);

    it('#getPath should get the path for file storage', function (done) { 
        createPath(function(err, pathInfo){
            file.getPath(pathInfo.id, function(err, fullPath){
                expect(err).not.to.exist;
                expect(fullPath).to.exist;
                expect(fullPath).to.eql(pathInfo.path);
                done();
            });
        });
    });

    it('#removeFiles should remove file storage', function (done) { 
        createPath(function(err, pathInfo){
            file.removeFiles(pathInfo.id, function(err){
                expect(err).not.to.exist;
                file.getPath(pathInfo.id, function(err, fullPath){
                    expect(err).not.to.exist;
                    expect(fullPath).not.to.exist;
                    done();
                });
            });
        });
    });

    it('#createWriteStream should create the write stream', writeFile);

    it('#createReadStream should create the read stream', function (done) { 
        writeFile(function(err, fileInfo1){
            file.createReadStream(fileInfo1.id, function(err, fileInfo2){
                expect(err).not.to.exist;
                expect(fileInfo2).to.exist;
                expect(fileInfo2).to.be.an('object');
                expect(fileInfo2.stream).to.exist;
                expect(fileInfo2.name).to.exist;
                expect(fileInfo2.name).to.eql(fileInfo1.name);
                expect(fileInfo2.id).to.exist;
                expect(fileInfo2.id).to.eql(fileInfo1.id);
                expect(fileInfo2.path).to.exist;
                expect(fileInfo2.path).to.eql(fileInfo1.path);
                expect(fileInfo2.dir).to.exist;
                expect(fileInfo2.dir).to.eql(fileInfo1.dir);
                fileInfo2.stream.setEncoding('utf8');
                var fileText = '';
                fileInfo2.stream.on('data', function(chunk) {
                    fileText += chunk;
                }).on('end', function() {
                    expect(fileText).to.eql(tmpText);
                    done();
                }).on('error', function(err) {
                    done(err);
                });
            });
        });
    });
});
