var RegClient = require('silent-npm-registry-client');
var os = require('os');
var semver = require('semver');
var async = require('async');

var ASNYC_PARALLELISM = 20;

var client = new RegClient({
  registry: 'http://registry.npmjs.org/',
  cache: os.tmpDir() + '/requiresafe'
});

function toModuleString(module) {
    return module.name + '@' + module.version;
}

function getPackageJson (module, cb) {
    client.get('/' + module.name, function (err, pkg) {
        var doc, version;

        if (err) {
            return cb(err);
        }

        version = semver.maxSatisfying(Object.keys(pkg.versions), module.version) || pkg['dist-tags'].latest;
        doc = pkg.versions[version];

        if (!doc) {
            return cb(new Error('Unknown package ' + toModuleString(module)));
        }

        cb(null, doc);
    });
}

function _savePackageDependencies(packageJson, targetObject, parent, cb) {
    var moduleString = toModuleString(packageJson);
    var alreadyChecked;

    if (!targetObject[moduleString]) {
        targetObject[moduleString] = {
            parents: [],
            children: [],
            source: 'npm'
        };
    } else {
        alreadyChecked = true;
    }

    if (parent) {
        targetObject[moduleString].parents.push(parent);
        targetObject[parent].children.push(moduleString);
    }

    var deps = packageJson.dependencies || {};

    if (alreadyChecked) {
        cb();
    } else {
        async.eachLimit(Object.keys(deps), ASNYC_PARALLELISM, function(dep, next) {
            getPackageJson({ name: dep, version: deps[dep] }, function (err, pkg) {
                if (err) {
                    if (err.message.match(/404/)) {
                        var vString = dep + '@' + deps[dep];
                        if (!targetObject[vString]) {
                            targetObject[vString] = {
                                parents: [],
                                children: [],
                                source: 'unknown'
                            };
                        }
                        targetObject[vString].parents.push(moduleString);
                        return next();
                    } else {
                        return next(err);
                    }
                }

                _savePackageDependencies(pkg, targetObject, moduleString, next);
            });
        }, cb);
    }
}

function getModuleDependencies(module, cb) {
    var results = {};

    getPackageJson(module, function (err, doc) {
        if (err) {
            return cb(err);
        }

        _savePackageDependencies(doc, results, undefined, function (err) {
            if (err) {
                return cb(err);
            }
            cb(null, results);
        });
    });
}

function getPackageDependencies(package, cb) {
    var result = {};
    _savePackageDependencies(package, result, undefined, function (err) {
        if (err) {
            return cb(err);
        }
        return cb(null, result);
    });
}

module.exports = {
    getModuleDependencies: getModuleDependencies,
    getPackageDependencies: getPackageDependencies,
    getPackageJson: getPackageJson
};


/*
    var derp = {
        name: 'herpmcderp',
        version: '0.7.6'
    };

    getAllDependencies(derp, function (err, results) {
        console.log(results)
    });
*/
