var fs = require('fs');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var config = require('../json/google-drive-config.json');
var _path = require('path');

var rootPath = _path.join(__dirname, '/..');
var SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata'];

var Datastore = require('nedb');
var db = new Datastore({
    filename: _path.join(rootPath, '/google_drive_db.json'),
    autoload: true
});

function GoogleService() {
    var clientSecret = config.installed.client_secret;
    var clientId = config.installed.client_id;
    var redirectUrl = process.env.NODE_HOSTNAME ? config.installed.redirect_uris[1] : config.installed.redirect_uris[0];
    var auth = new googleAuth();
    this.oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
}

GoogleService.prototype.onGET = function (params, ip, callback) {
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

GoogleService.prototype.onPOST = function (params, ip, callback) {
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
            var dest = req.body.dest;
            var filename = req.body.name;
            uploadFile.call(this, ip, id, dest, filename, callback);
            break;
        default:
            callback('There no API');
            break;
    }
}

function authorize(ip, callback) {
    var self = this;
    var authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'online',
        scope: SCOPES
    });

    db.findOne({
        ip: ip
    }, function (err, doc) {
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

GoogleService.prototype.refreshToken = function (params, ip, callback) {
    var self = this;
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                self.oauth2Client.refreshToken_(doc.token.access_token, function (error, newToken) {
                    if (error) {
                        db.remove({
                            ip: ip
                        }, {
                            multi: true
                        }, function (deleteError) {
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
                        }, {}, function (errorUpdate) {
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
    this.oauth2Client.getToken(code, function (err, token) {
        if (err) {
            callback(err);
        } else {
            if (!token) {
                callback(null, false, 'redirect');
            } else {
                var dataStore = {
                    ip: ip,
                    token: token
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
                                    callback(null, true, 'redirect');
                                }
                            });
                        } else {
                            db.insert(dataStore, function (error) {
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
        }
    });
}

function formatFile(files) {
    var listData = [];
    for (var key in files) {
        var element = files[key];
        var mimeType = element.mimeType == 'application/vnd.google-apps.folder' ? 'folder' : 'file';
        var data = {
            id: element.id,
            name: element.name,
            mimeType: mimeType,
            modifiedTime: element.modifiedTime,
            size: element.size,
            thumbnailLink: element.thumbnailLink
        };
        listData.push(data);
    }
    return listData;
}

function listFilesRoot(ip, callback) {
    var auth = this.oauth2Client;
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                auth.credentials = doc.token;
                var service = google.drive('v3');
                service.files.list({
                    auth: auth,
                    pageSize: 100,
                    q: "'root' in parents and 'me' in owners",
                    fields: "files(id, name, size, kind, modifiedTime, size, parents, mimeType, thumbnailLink)"
                }, function (err, response) {
                    if (err) {
                        callback('The API returned an error: ' + err);
                    } else {
                        var files = response.files;
                        if (files.length == 0) {
                            callback('No files found.');
                        } else {
                            callback(null, formatFile(files));
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

function listFiles(ip, id, callback) {
    var auth = this.oauth2Client;
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                auth.credentials = doc.token;
                var service = google.drive('v3');
                service.files.list({
                    auth: auth,
                    pageSize: 100,
                    q: `'${id}' in parents and 'me' in owners`,
                    fields: "files(id, name, size, kind, modifiedTime, thumbnailLink, webViewLink, iconLink, ownedByMe, parents, mimeType)"
                }, function (err, response) {
                    if (err) {
                        callback('The API returned an error: ' + err);
                    } else {
                        var files = response.files;
                        if (files.length == 0) {
                            callback('No files found.');
                        } else {
                            callback(null, formatFile(files));
                        }
                    }
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
    var auth = this.oauth2Client;
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                auth.credentials = doc.token;
                var service = google.drive('v3');
                try {
                    var dest = fs.createWriteStream(_dest);
                    service.files.get({
                            auth: auth,
                            fileId: id,
                            alt: 'media'
                        })
                        .on('end', function () {
                            callback(null, {
                                status: true
                            });
                        })
                        .on('error', function (err) {
                            callback('Error during download', err);
                        })
                        .pipe(dest);
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

function uploadFile(ip, id, _dest, name, callback) {
    var auth = this.oauth2Client;
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                auth.credentials = doc.token;
                var service = google.drive('v3');
                try {
                    var fileMetadata = {
                        'name': name,
                        'parents': [id]
                    };
                    if (fs.existsSync(_dest)) {
                        try {
                            var dest = fs.createReadStream(_dest);
                        } catch (error) {
                            callback(error);
                            return;
                        }
                        var media = {
                            body: dest
                        };
                        service.files.create({
                            auth: auth,
                            resource: fileMetadata,
                            media: media,
                            fields: 'id'
                        }, function (err, file) {
                            if (err) {
                                callback(err);
                            } else {
                                callback(null, {
                                    status: true
                                });
                            }
                        });
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

module.exports = new GoogleService();
