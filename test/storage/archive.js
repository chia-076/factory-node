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
var Archive = require('../../krot').archive;

describe('Archive', function () {
    var tmpDir = path.resolve(__dirname + '/../../teststorage');
    var tmpSubDir = 'testsubdir';
    var tmpText = ' Test message 123 !@#$%^&*()_+{}[]<>?\n ---new line';
    var tmpFile = 'tmpfile.txt';
    var file = null, archive = null;

    beforeEach(function(done) {
        file = new File(tmpDir, {
            initCallback: function(err) {
                expect(err).not.to.exist;
                archive = new Archive(file);
                done();
            }
        });
    });

    afterEach(function(done) {
        file = null;
        archive = null;
        rimraf(tmpDir, done);
    });

    var compress = function (done) {
        file.createPath(function(err, pathInfo){
            var fullPath = path.join(pathInfo.path, tmpSubDir);
            fs.mkdir(fullPath, function (err) {
                expect(err).not.to.exist;
                fullPath = path.join(fullPath, tmpFile);
                fs.writeFile(fullPath, tmpText, function (err) {
                    expect(err).not.to.exist;
                    archive.compress(pathInfo.path, function(err, archiveInfo) {
                        expect(err).not.to.exist;
                        expect(archiveInfo).to.exist;
                        expect(archiveInfo).to.be.an('object');
                        expect(archiveInfo.id).to.exist;
                        expect(archiveInfo.pathIn).to.exist;
                        expect(archiveInfo.pathOut).to.exist;
                        done(err, archiveInfo);
                    });
                });
            });
        });
    };

    it('#compress should compress into the archive', compress);

    it('#extract should extract from the archive', function (done) {
        compress(function(err, archiveInfo1) {
            expect(err).not.to.exist;
            archive.extract(archiveInfo1.pathOut, { normalize: true }, function(err, archiveInfo2) {
                expect(err).not.to.exist;
                expect(archiveInfo2).to.exist;
                expect(archiveInfo2).to.be.an('object');
                expect(archiveInfo2.id).to.exist;
                expect(archiveInfo2.pathIn).to.exist;
                expect(archiveInfo2.pathOut).to.exist;
                var fullPath = path.join(archiveInfo2.pathOut, tmpFile);
                fs.readFile(fullPath, 'utf8', function (err, text) {
                    expect(err).not.to.exist;
                    expect(text).to.exist;
                    expect(text).to.eql(tmpText);
                    done();
                });
            });
        });
    });
});
