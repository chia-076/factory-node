'use strict';

var _ = require('lodash');

/**
 * urls that doesnt need user to be authenticated
 * @type {Array}
 */
var unsecureUrls = [
    '/login',
    '/auth/callback',
    '/logout'
];

/**
 * add unsecure url to url list
 * @param {String|Array} urls
 */
exports.add = function (urls) {
    if (_(urls).isArray()) {
        unsecureUrls = _.union(unsecureUrls, urls);
    } else if (_(urls).isString() && unsecureUrls.indexOf(urls) <= 0) {
        unsecureUrls.push(urls);
    }
};


/**
 * check if the url (with or without trailing slashes) is in the list
 * of unsecure urls
 * @param  {String}
 * @return {Boolean}
 */
exports.check = function (url) {
    var i,
        unsecureUrlsLength = unsecureUrls.length;

    for (i = unsecureUrlsLength - 1; i >= 0; i -= 1) {
        if (unsecureUrls[i] === url || unsecureUrls[i] + '/' === url ||
                (_(unsecureUrls[i]).last() === '*' && url.indexOf(unsecureUrls[i].slice(0, -1)) === 0)) {
            return true;
        }
    }

    return false;
};