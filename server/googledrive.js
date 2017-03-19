var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var config = require('../json/google-drive-config.json');
var path = require('path');
var rootPath = path.join(__dirname, '/..');
var SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];

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
        case 'url':
            getURL.call(this, callback);
            break;
        case 'authorize':
            authorize.call(this, ip, callback);
            break;
        case 'files':
            listFiles.call(this, ip, callback);
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

function getURL(callback) {
    var authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    if (authUrl) {
        callback(null, {
            url: authUrl
        });
    } else {
        callback('Can not generate authorize url');
    }
}

function authorize(ip, callback) {
    console.log(ip);
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

function storeToken(ip, code, callback) {
    console.log(ip);
    this.oauth2Client.getToken(code, function (err, token) {
        if (err) {
            callback(err);
        }else{
            if(!token){
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
                        db.update({_id: doc._id}, dataStore, {}, function (error) {
                            if(error){
                                callback(error);
                            }else{
                                callback(null, true, true);
                            }
                        })
                    } else {
                        db.insert(dataStore, function (error) {
                            if(error){
                                callback(error);
                            }else{
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
                    pageSize: 10,
                    fields: "nextPageToken, files(id, name)"
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
                callback(null, {
                    status: false
                });
            }
        }
    })
}

module.exports = new GoogleService();