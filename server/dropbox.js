var fs = require('fs');
var node_dropbox = require('node-dropbox');
var Dropbox = require('dropbox');
var config = require('../json/dropbox-config.json');
var path = require('path');
var rootPath = path.join(__dirname, '/..');

var app_key = config.installed.app_key;
var secret = config.installed.secret;
var redirectUrl = process.env.NODE_HOSTNAME ? config.installed.redirect_uris[1] : config.installed.redirect_uris[0];

var Datastore = require('nedb');
var db = new Datastore({
    filename: path.join(rootPath, '/dropbox_db.json'),
    autoload: true
});

function DropboxService() {};

DropboxService.prototype.onGET = function (params, ip, callback) {
    var name = params.name;
    var req = params.request;

    switch (name) {
        case 'authorize':
            authorize.call(this, ip, callback);
            break;
        case 'files':
            var path = req.query['path'];
            if (!path) {
                listFiles.call(this, ip, '', callback);
            } else {
                listFiles.call(this, ip, path, callback);
            }
            break;
        case '':
            var code = req.query['code'];
            storeToken.call(this, ip, code, callback);
            break;
        default:
            callback('There no API');
            break;
    }
}

DropboxService.prototype.onPOST = function (params, ip, callback) {
    var name = params.name;
    var req = params.request;
    switch (name) {
        case 'download':
            var path = req.body.path;
            var dest = req.body.dest;
            downloadFile.call(this, ip, path, dest, callback);
            break;
        case 'upload':
            var path = req.body.path;
            var dest = req.body.dest;
            uploadFile.call(this, ip, path, dest, callback);
            break;
        default:
            callback('There no API');
            break;
    }
}

function authorize(ip, callback) {
    node_dropbox.Authenticate(app_key, secret, redirectUrl, function (err, url) {
        db.findOne({
            ip: ip
        }, function (err, doc) {
            if (err) {
                callback(err);
            } else {
                if (doc) {
                    callback(null, {
                        status: true,
                        authUrl: url
                    });
                } else {
                    callback(null, {
                        status: false,
                        authUrl: url
                    });
                }
            }
        });
    });
}

function storeToken(ip, code, callback) {
    node_dropbox.AccessToken(app_key, secret, code, redirectUrl, function (err, body) {
        if (err) {
            callback(err);
        } else {
            var access_token = body.access_token;
            if (!access_token) {
                callback(null, false, true);
            } else {
                var dataStore = {
                    ip: ip,
                    token: access_token
                };
                db.findOne({
                    ip: ip
                }, function (err, doc) {
                    if (err) {
                        callback(err);
                    } else {
                        if (doc) {
                            db.update({
                                _id: doc._id
                            }, dataStore, {}, function (error) {
                                if (error) {
                                    callback(error);
                                } else {
                                    callback(null, true, true);
                                }
                            });
                        } else {
                            db.insert(dataStore, function (error) {
                                if (error) {
                                    callback(error);
                                } else {
                                    callback(null, true, true);
                                }
                            });
                        }
                    }
                });
            }
        }
    });
}


function listFiles(ip, path, callback) {
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                var dbx = new Dropbox({
                    accessToken: doc.token
                });
                dbx.filesListFolder({
                        path: path
                    })
                    .then(function (response) {
                        if (response) {
                            callback(null, formatFile(response.entries));
                        } else {
                            callback('No files found.');
                        }
                    })
                    .catch(function (error) {
                        callback(error);
                    });
            } else {
                callback(null, {
                    status: false
                });
            }
        }
    });
}


function formatFile(files) {
    var listData = [];
    for (var key in files) {
        var element = files[key];
        var data = {
            id: element.id,
            name: element.name,
            mimeType: element['.tag'],
            modifiedTime: element['server_modified'],
            size: element.size,
            path: element['path_lower']
        };
        listData.push(data);
    }
    return listData;
}

function downloadFile(ip, path, _dest, callback) {
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                var dbx = new Dropbox({
                    accessToken: doc.token
                });
                dbx.filesDownload({
                        path: path
                    })
                    .then(function (response) {
                        if (response) {
                            try {
                                fs.writeFile(_dest, response.fileBinary, 'binary', function (error) {
                                    if (error) {
                                        callback(error);
                                    } else {
                                        callback(null, {
                                            status: true
                                        });
                                    }
                                });
                            } catch (error) {
                                callback(error);
                            }
                        } else {
                            callback('No files found.');
                        }
                    })
                    .catch(function (error) {
                        callback(error);
                    });
            } else {
                callback(null, {
                    status: false
                });
            }
        }
    });
}

function uploadFile(ip, path, _dest, callback) {
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                var dbx = new Dropbox({
                    accessToken: doc.token
                });
                if (fs.existsSync(_dest)) {
                    try {
                        var dest = fs.readFileSync(_dest);
                    } catch (error) {
                        callback(error);
                        return;
                    }
                    dbx.filesUpload({
                            contents: dest,
                            path: path,
                            autorename: true
                        })
                        .then(function (response) {
                            callback(null, {
                                status: true
                            });
                        })
                        .catch(function (error) {
                            callback(error);
                        });
                } else {
                    callback("Can not find file path");
                }

            } else {
                callback(null, {
                    status: false
                });
            }
        }
    });
}

module.exports = new DropboxService();
