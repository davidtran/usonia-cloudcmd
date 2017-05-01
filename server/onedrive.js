var fs = require('fs');
var config = require('../json/onedrive-config.json');
var _path = require('path');
var request = require('request');
var rootPath = _path.join(__dirname, '/..');
var rootURL = "https://graph.microsoft.com/v1.0";
var Datastore = require('nedb');
var oneDriveAPI = require('onedrive-api');
var fsAccess = require('fs-access');
var _ = require('lodash');
var db = new Datastore({
    filename: _path.join(rootPath, '/onedrive_db.json'),
    autoload: true
});

function OneDriveService() {
    var clientId = config.installed.app_key;
    var scopes = config.installed.scopes;
    var host = process.env.NODE_HOSTNAME || 'http://localhost:8000';
    var redirectUrl = host + config.installed.redirect;
    var secret = config.installed.secret;
    this.oneDriveCLient = {
        clientId: clientId,
        secret: secret,
        scopes: scopes,
        redirectUri: redirectUrl
    };
}

OneDriveService.prototype.onGET = function(params, ip, callback) {
    var name = params.name;
    var req = params.request;

    switch (name) {
        case 'authorize':
            authorize.call(this, ip, callback);
            break;
        case 'files':
            var id = req.query['id'];
            if (!id) {
                listFilesRoot.call(this, ip, callback);
            } else {
                listFiles.call(this, ip, id, callback);
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

OneDriveService.prototype.onPOST = function(params, ip, callback) {
    var name = params.name;
    var req = params.request;
    switch (name) {
        case 'download':
            var id = req.body.id;
            var dest = req.body.dest;
            downloadFile.call(this, ip, id, dest, callback);
            break;
        case 'upload':
            var id = req.body.id;
            var source = req.body.source;
            var filename = req.body.name;
            uploadFile.call(this, ip, id, source, filename, callback);
            break;
        default:
            callback('There no API');
            break;
    }
}

function authorize(ip, callback) {
    var authUrl = "https://login.live.com/oauth20_authorize.srf?client_id=" + this.oneDriveCLient.clientId + "&redirect_uri=" + this.oneDriveCLient.redirectUri + "&response_type=code&scope=" + this.oneDriveCLient.scopes;

    db.findOne({
        ip: ip
    }, function(err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                callback(null, {
                    status: true,
                    authUrl: authUrl
                });
            } else {
                callback(null, {
                    status: false,
                    authUrl: authUrl
                });
            }
        }
    })
}

OneDriveService.prototype.refreshToken = function(params, ip, callback) {
    var self = this;
    db.findOne({
        ip: ip
    }, function(err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                request.post('https://login.live.com/oauth20_token.srf', {
                    form: {
                        refresh_token: doc.token.refresh_token,
                        client_id: self.oneDriveCLient.clientId,
                        client_secret: self.oneDriveCLient.secret,
                        grant_type: 'refresh_token',
                        redirect_uri: self.oneDriveCLient.redirectUri
                    }
                }, function(error, res, body) {
                    var newToken = JSON.parse(body);
                    if (error || (newToken && newToken.error)) {
                        db.remove({
                            ip: ip
                        }, {
                            multi: true
                        }, function(deleteError) {
                            callback();
                        })
                    } else {
                        var dataStore = {
                            token: newToken
                        };
                        db.update({
                            ip: ip
                        }, {
                            $set: dataStore
                        }, {}, function(errorUpdate) {
                            if (errorUpdate) {
                                callback();
                            } else {
                                callback();
                            }
                        });
                    }
                });
            } else {
                callback();
            }
        }
    });
};

function storeToken(ip, code, callback) {
    request.post('https://login.live.com/oauth20_token.srf', {
        form: {
            code: code,
            client_id: this.oneDriveCLient.clientId,
            client_secret: this.oneDriveCLient.secret,
            grant_type: 'authorization_code',
            redirect_uri: this.oneDriveCLient.redirectUri
        }
    }, function(error, res, body) {
        var token = JSON.parse(body);
        if (error || !token || (token && token.error)) {
            callback(null, false, 'redirect');
        } else {
            var dataStore = {
                ip: ip,
                token: token
            };
            db.findOne({
                ip: ip
            }, function(err, doc) {
                if (err) {
                    callback(err);
                } else {
                    if (doc) {
                        db.update({
                            _id: doc._id
                        }, dataStore, {}, function(error) {
                            if (error) {
                                callback(error);
                            } else {
                                callback(null, true, 'redirect');
                            }
                        });
                    } else {
                        db.insert(dataStore, function(error) {
                            if (error) {
                                callback(error);
                            } else {
                                callback(null, true, 'redirect');
                            }
                        });
                    }
                }
            });
        }
    })
}

function formatFile(files) {
    var listData = [];
    for (var key in files) {
        var element = files[key];
        var mimeType = element.folder ? 'folder' : 'file';
        var data = {
            id: element.id,
            name: element.name,
            mimeType: mimeType,
            modifiedTime: element.lastModifiedDateTime,
            size: element.size
        };
        listData.push(data);
    }
    return listData;
}

function listFilesRoot(ip, callback) {
    db.findOne({
        ip: ip
    }, function(err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                oneDriveAPI.items.listChildren({
                    accessToken: doc.token.access_token,
                    rootItemId: "root"
                }).then((response) => {
                    var files = response.value;
                    if (files.length == 0) {
                        callback('No files found.');
                    } else {
                        callback(null, formatFile(files));
                    }
                }).catch((err) => {
                    callback('The API returned an error: ' + err);
                });
            } else {
                callback(null, {
                    status: false
                });
            }
        }
    });
}

function listFiles(ip, id, callback) {
    db.findOne({
        ip: ip
    }, function(err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                oneDriveAPI.items.listChildren({
                    accessToken: doc.token.access_token,
                    itemId: id
                }).then((response) => {
                    var files = response.value;
                    if (files.length == 0) {
                        callback('No files found.');
                    } else {
                        callback(null, formatFile(files));
                    }
                }).catch((err) => {
                    callback('The API returned an error: ' + err);
                });

            } else {
                callback(null, {
                    status: false
                });
            }
        }
    })
}

function downloadFile(ip, id, _dest, callback) {
    db.findOne({
        ip: ip
    }, function(err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                var folder = _.initial(_dest.split('/')).join('/');
                fs.access(folder, fs.W_OK, function (err) {
                    if (err) {
                        callback('Can\'t not save to this folder');
                    }else{
                        try {
                            var dest = fs.createWriteStream(_dest);
                            var options = {
                                method: 'GET',
                                uri: 'https://api.onedrive.com/v1.0/drive/items/' + id + "/content",
                                headers: {
                                Authorization: "Bearer " + doc.token.access_token
                                },
                            };
                            request(options, function (error, res, body) {
                                if(error){
                                    callback('Error during download');
                                }else{
                                    callback(null, {
                                        status: true
                                    });
                                }
                            }).pipe(dest);
                        } catch (error) {
                            callback(error);
                        }
                    }
                });
            } else {
                callback(null, {
                    status: false
                });
            }
        }
    });
}

function uploadFile(ip, id, _source, name, callback) {
    db.findOne({
        ip: ip
    }, function(err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                try {
                    if (fs.existsSync(_source)) {
                        try {
                            var dest = fs.createReadStream(_source);
                        } catch (error) {
                            callback(error);
                            return;
                        }
                        var media = {
                            body: dest
                        };
                        oneDriveAPI.items.uploadSimple({
                            accessToken: doc.token.access_token,
                            filename: name,
                            readableStream: dest,
                            parentId: id
                        }).then((item) => {
                            callback(null, {
                                status: true
                            });
                        }).catch((err) => {
                            callback(err);
                        })
                    } else {
                        callback("Can not find file path");
                    }
                } catch (error) {
                    callback(error);
                }

            } else {
                callback(null, {
                    status: false
                });
            }
        }
    });
}

module.exports = new OneDriveService();