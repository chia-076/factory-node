'use strict';

module.exports = {
    auth: require('./lib/auth/authentication'),
    authMock: require('./lib/authMock/authentication'),
    passwordAuthMock: require('./lib/passwordAuthMock/authentication'),
    serviceProxy: require('./lib/serviceProxy/serviceProxy'),
    services: require('./lib/services/services'),
    validation: require('./lib/validation/validation'),
    notification: require('./lib/notification/notification'),
    channel: require('./lib/notification/channel'),
    file: require('./lib/storage/file'),
    archive: require('./lib/storage/archive'),
    fileServer: require('./lib/storage/fileServer'),
    cache: require('./lib/cache/cache'),
    metrics: require('./lib/metrics/metrics'),
    session: require('./lib/cache/sessionClientStore'),
    cacheClients: {
        Redis: require('./lib/cache/clients/redis'),
        Void: require('./lib/cache/clients/void'),
        Memcached: require('./lib/cache/clients/memcached')
    },
    components: {
        incidentReport: require('./lib/components/incidentReport')
    }
};
