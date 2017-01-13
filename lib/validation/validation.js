'use strict';

var _ = require('lodash');
var validator = require('validator');

var validationRules = {};

var getValue = function (object, valuePath) {
    var result = {success: true};


    _.each(valuePath, function (item) {
        if (!object[item]) {
            result.success = false;
            result.error = 'there is no such item: ' + item;
            return false;
        }
        object = object[item];
    });

    if (result.success) {
        result.value = object;
    }
    return result;
};

var validate = function (data, ruleNames, fieldName, errorMessage) {
    if (!_.isArray(ruleNames)) {
        ruleNames = [ruleNames];
    }
    var errors = [];

    _.each(ruleNames, function (ruleName) {
        var rule = validationRules[ruleName];
        var error;

        if (rule) {
            error = rule(data);
        } else if (ruleName.indexOf('is') === 0 && validator[ruleName]) {
            rule = validator[ruleName].bind(validator);

            if (!rule(data)) {
                error = errorMessage || 'The value should be ' + ruleName.replace('is', '').toLowerCase();
            }
        } else {
            error = 'There is no such rule' + rule;
        }

        if (!error) {
            return;
        }

        error = (!fieldName) ? error : {field: fieldName, description: error};
        errors.push(error);

    });

    return errors;
};

var createValidator = function (ruleDescriptor) {
    if (!ruleDescriptor.from) {
        throw new Error('There is no value field in ruleDescriptor');
    }

    var from = ruleDescriptor.from.split('.');

    return function (req) {
        var result = getValue(req, from);

        //if validated field is absent
        if (!result.success) {
            //if validated field isn't required
            if (ruleDescriptor.required === false) {
                return undefined;
            //if validated field is absent, but required
            } else {
                return {field: ruleDescriptor.from, description: result.error};
            }
        //if validated field is present and required, but validation rule is not specified
        } else if (!ruleDescriptor.rule) {
            return undefined;
        }

        return validate(result.value, ruleDescriptor.rule, ruleDescriptor.from, ruleDescriptor.error);
    };
};

var validateArguments = function (args, validators) {
    var errors = _.map(validators, function (validator) {
        if (_.isFunction(validator)) {
            return validator.apply(null, args);
        } else {
            return 'Rule should be a function';
        }
    });

    return _.compact(_.flatten(errors));
};

var addValidation = function () {
    var validators = _.toArray(arguments);

    validators = _.map(validators, function (validator) {
        if (_.isPlainObject(validator)) {
            return createValidator(validator);
        }
        return validator;
    });

    return function (req, res, next) {
        var errors = validateArguments(_.toArray(arguments), validators);

        if (errors.length) {
            return next({statusCode: 400, message: errors});
        }

        next();
    };
};

var setRules = function (rules) {
    validationRules = _.assign(validationRules, rules);
};

module.exports = {
    addValidation: addValidation,
    validate: validate,
    setRules: setRules
};



