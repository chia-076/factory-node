/*global describe, it: true*/

'use strict';

// var sinon = require('sinon');
var expect = require('chai').expect;
var rewire = require('rewire');

var unsecureUrl = rewire('../../lib/auth/unsecureUrl');

describe('unsecureUrl', function () {
    it('#add should expand unsecure urls', function () {
        var fooUrl = '/foo',
            urlList = ['/asd', '/bar'];

        unsecureUrl.add(fooUrl);
        var unsecureUrls = unsecureUrl.__get__('unsecureUrls');
        expect(unsecureUrls).to.contain(fooUrl);

        unsecureUrl.add(urlList);
        unsecureUrls = unsecureUrl.__get__('unsecureUrls');
        expect(unsecureUrls).to.contain(fooUrl);

    });

    it('#check should return true if url is in the list and false if not', function () {
        unsecureUrl.add('/fooBar');
        unsecureUrl.add('/template*');

        expect(unsecureUrl.check('/fooBar')).to.eql(true);
        expect(unsecureUrl.check('/fooBar/')).to.eql(true);
        expect(unsecureUrl.check('/fooBar1/')).to.eql(false);
        expect(unsecureUrl.check('/template')).to.eql(true);
        expect(unsecureUrl.check('/template/test')).to.eql(true);
        expect(unsecureUrl.check('/templatte/test')).to.eql(false);
    });
});
