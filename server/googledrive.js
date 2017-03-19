var fs = require('fs');
var files = require('files-io');
var http = require('http');
const https = require('https');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var config = require('../json/google-drive-config.json');
var path = require('path');
var rootPath = path.join(__dirname, '/..');
var SCOPES = ['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/drive.appdata'];

var Datastore = require('nedb');
var db = new Datastore({
    filename: path.join(rootPath, '/google_drive_db.json'),
    autoload: true
});

function GoogleService() {
    var clientSecret = config.installed.client_secret;
    var clientId = config.installed.client_id;
    var redirectUrl = config.installed.redirect_uris[0];
    var auth = new googleAuth();
    this.oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
};

GoogleService.prototype.onGET = function (params, callback) {
    var name = params.name;
    var req = params.request;
    var ip =
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

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
        case 'download':
            var id = req.query['id'];
            downloadFile.call(this, ip, id, callback);
            break;
        case '':
            var code = req.query['code'];
            // code = code.slice(0, -1);
            storeToken.call(this, ip, code, callback);
            break;
        default:
            callback('There no API');
            break;
    }
}

GoogleService.prototype.onPOST = function (params, callback) {
    var name = params.name;
    var req = params.request;
    var ip =
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    switch (name) {
        case 'download':
            var id = req.body.id
            var dest = req.body.dest
            downloadFile.call(this, ip, id, dest, callback);
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
                refreshToken(doc.token, function (status) {
                    if (status) {
                        callback(null, {
                            status: true,
                            authUrl: authUrl
                        });
                    } else {
                        callback('can not refresh token');
                    }
                })
            } else {
                callback(null, {
                    status: false,
                    authUrl: authUrl
                });
            }
        }
    })
}

function refreshToken(token, callback) {
    var self = this;
    var currentTime = new Date();
    if (token.expiry_date < currentTime.getTime()) {
        self.oauth2Client.refreshToken_(token.access_token, function (error, newToken) {
            if (error) {
                callback(error);
                return;
            }
            var dataStore = {
                ip: ip,
                token: newToken
            };
            db.update({
                _id: doc._id
            }, dataStore, {}, function (errorUpdate) {
                if (errorUpdate) {
                    callback(false);
                } else {
                    callback(true);
                }
            })

        })
    } else {
        callback(true);
    }
}

function storeToken(ip, code, callback) {
    console.log(ip);
    this.oauth2Client.getToken(code, function (err, token) {
        if (err) {
            callback(err);
        } else {
            if (!token) {
                callback(null, false, true);
                return;
            }
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

function listFilesRoot(ip, callback) {
    var auth = this.oauth2Client;
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                refreshToken(doc.token, function (status) {
                    if (status) {
                        auth.credentials = doc.token;
                        var service = google.drive('v3');
                        service.files.list({
                            auth: auth,
                            pageSize: 100,
                            q: "'root' in parents and 'me' in owners",
                            fields: "nextPageToken, files(id, name, size, kind, modifiedTime, thumbnailLink, webViewLink, iconLink, ownedByMe, parents, mimeType)"
                        }, function (err, response) {
                            if (err) {
                                callback('The API returned an error: ' + err);
                                return;
                            }
                            var files = response.files;
                            if (files.length == 0) {
                                callback('No files found.');
                            } else {
                                callback(null, files);
                            }
                        });
                    } else {
                        callback('can not refresh token');
                    }
                })
            } else {
                callback(null, {
                    status: false
                });
            }
        }
    })
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
                refreshToken(doc.token, function (status) {
                    if (status) {
                        auth.credentials = doc.token;
                        var service = google.drive('v3');
                        service.files.list({
                            auth: auth,
                            pageSize: 100,
                            q: `'${id}' in parents and 'me' in owners`,
                            fields: "nextPageToken, files(id, name, size, kind, modifiedTime, thumbnailLink, webViewLink, iconLink, ownedByMe, parents, mimeType)"
                        }, function (err, response) {
                            if (err) {
                                callback('The API returned an error: ' + err);
                                return;
                            }
                            var files = response.files;
                            if (files.length == 0) {
                                callback('No files found.');
                            } else {
                                callback(null, files);
                            }
                        });
                    } else {
                        callback('can not refresh token');
                    }
                })
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
                refreshToken(doc.token, function (status) {
                    if (status) {
                        auth.credentials = doc.token;
                        var service = google.drive('v3');
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
                    } else {
                        callback('can not refresh token');
                    }
                })
            } else {
                callback(null, {
                    status: false
                });
            }
        }
    })

}

module.exports = new GoogleService();
