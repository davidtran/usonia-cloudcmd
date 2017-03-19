var node_dropbox = require('node-dropbox');
var Dropbox = require('dropbox');
var config = require('../json/dropbox-config.json');
var path = require('path');
var rootPath = path.join(__dirname, '/..');

var app_key = config.installed.app_key;
var secret = config.installed.secret;
var redirectUrl = config.installed.redirect_uris[0];

var Datastore = require('nedb');
var db = new Datastore({
    filename: path.join(rootPath, '/dropbox_db.json'),
    autoload: true
});

function DropboxService() {};

DropboxService.prototype.onGET = function (params, callback) {
    var name = params.name;
    var req = params.request;
    var ip = req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    switch (name) {
        case 'authorize':
            authorize.call(this, ip, callback);
            break;
            case 'files':
                listFiles.call(this, ip, callback);
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
        })
    });
}

function storeToken(ip, code, callback) {
    node_dropbox.AccessToken(app_key, secret, code, redirectUrl, function(err, body) {
        if(err){
            callback(err);
        }else{
            access_token = body.access_token;
            if (!access_token) {
                callback(null, false, true);
                return;
            }
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
                        })
                    } else {
                        db.insert(dataStore, function (error) {
                            if (error) {
                                callback(error);
                            } else {
                                callback(null, true, true);
                            }
                        })
                    }
                }
            })
        }
    });
}


function listFiles(ip, callback) {
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
                        path: ''
                    })
                    .then(function (response) {
                        callback(null, response)
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
    })
}

module.exports = new DropboxService();
