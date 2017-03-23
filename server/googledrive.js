var fs = require('fs');
var files = require('files-io');
var http = require('http');
const https = require('https');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var config = require('../json/google-drive-config.json');
var path = require('path');
const requestIp = require('request-ip');
var ipaddr = require('ipaddr.js');
var rootPath = path.join(__dirname, '/..');
var SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata'];

var Datastore = require('nedb');
var db = new Datastore({
    filename: path.join(rootPath, '/google_drive_db.json'),
    autoload: true
});

function GoogleService() {
    var clientSecret = config.installed.client_secret;
    var clientId = config.installed.client_id;
    var redirectUrl = process.env.NODE_HOSTNAME ? config.installed.redirect_uris[1] : config.installed.redirect_uris[0];
    var auth = new googleAuth();
    this.oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
};

GoogleService.prototype.onGET = function (params, callback) {
    var name = params.name;
    var req = params.request;
    var ip = requestIp.getClientIp(req);
    ip = ipaddr.process(ip).toString();
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
    var ip = requestIp.getClientIp(req);
    ip = ipaddr.process(ip).toString();
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

GoogleService.prototype.refreshToken = function (params, callback) {
    var self = this;
    var req = params.request;
    var ip = requestIp.getClientIp(req);
    ip = ipaddr.process(ip).toString();
    db.findOne({
        ip: ip
    }, function (err, doc) {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                self.oauth2Client.refreshToken_(doc.token.access_token, function (error, newToken) {
                    if (error) {
                        console.log(error);
                        db.remove({
                            ip: ip
                        }, {
                            multi: true
                        }, function (deleteError) {
                            console.log(deleteError);
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
                                console.log(errorUpdate)
                                callback();
                            } else {
                                callback();
                            }
                        })
                    }
                })
            } else {
                callback();
            }
        }
    })


}

function storeToken(ip, code, callback) {

    this.oauth2Client.getToken(code, function (err, token) {
        if (err) {
            callback(err);
        } else {
            if (!token) {
                callback(null, false, true);
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
                });
            }
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
                console.log('doc', doc);
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
                    } else {
                        var files = response.files;
                        if (files.length == 0) {
                            callback('No files found.');
                        } else {
                            callback(null, files);
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
                    fields: "nextPageToken, files(id, name, size, kind, modifiedTime, thumbnailLink, webViewLink, iconLink, ownedByMe, parents, mimeType)"
                }, function (err, response) {
                    if (err) {
                        callback('The API returned an error: ' + err);
                    } else {
                        var files = response.files;
                        if (files.length == 0) {
                            callback('No files found.');
                        } else {
                            callback(null, files);
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
                        'parents' : [id]
                    };
                    if(fs.existsSync(_dest)){
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
                        }, function(err, file) {
                            if(err) {
                                callback(err);
                            } else {
                                console.log(file);
                                callback(null, {
                                    status: true
                                });
                            }
                        });
                    }else{
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
