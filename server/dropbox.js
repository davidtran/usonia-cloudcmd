var fs = require('fs');
var node_dropbox = require('node-dropbox');
var Dropbox = require('dropbox');
var config = require('../json/dropbox-config.json');
var _path = require('path');
var rootPath = _path.join(__dirname, '/..');

var app_key = config.installed.app_key;
var secret = config.installed.secret;
var redirectUrl = process.env.NODE_HOSTNAME ? config.installed.redirect_uris[1] : config.installed.redirect_uris[0];

var Datastore = require('nedb');
var db = new Datastore({
    filename: _path.join(rootPath, '/dropbox_db.json'),
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
            var host = params.request.protocol + '://' + params.request.get('host');
            if (!path) {
                listFiles.call(this, ip, host, '', callback);
            } else {
                listFiles.call(this, ip, host, path, callback);
            }
            break;
        case 'thumbnail':
            var path = req.query['path'];
            getThumbnail.call(this, ip, path, callback);
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
            var source = req.body.souce;
            var name = req.body.name;
            uploadFile.call(this, ip, path, source, name, callback);
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
                callback(null, false, 'redirect');
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


function listFiles(ip, host, path, callback) {
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
                            callback(null, formatFile(response.entries, host));
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


function formatFile(files, host) {
    var listData = [];
    for (var key in files) {
        var element = files[key];
        var ext = element['path_lower'].substr(element['path_lower'].length - 3);
        var listImageTypes = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'gif', 'bmp'];
        var thumbnailLink = null;
        if (element['.tag'] === 'file' && listImageTypes.indexOf(ext) > -1) {
            thumbnailLink = host + '/provider/dropbox/thumbnail?path=' +  element['path_lower'];
        }
        var data = {
            id: element.id,
            name: element.name,
            mimeType: element['.tag'],
            modifiedTime: element['server_modified'],
            size: element.size,
            path: element['path_lower'],
            thumbnailLink: thumbnailLink
        };
        listData.push(data);
    }
    return listData;
}

function getThumbnail(ip, path, callback) {
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
                var ext = path.substr(path.length - 3);
                var listImageTypes = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'gif', 'bmp'];
                if (listImageTypes.indexOf(ext) > -1) {
                    dbx.filesGetThumbnail({
                            path: path,
                            size: 'w640h480'
                        })
                        .then(function (response) {
                            if (response) {
                                callback(null, response.fileBinary, 'image');
                            } else {
                                callback('No files found.');
                            }
                        })
                        .catch(function (error) {
                            callback(error);
                        });
                } else {
                    callback(null, null, 'image');
                }
            } else {
                callback(null, {
                    status: false
                });
            }
        }
    });
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

function uploadFile(ip, path, _source, name, callback) {
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
                if (fs.existsSync(_source)) {
                    try {
                        var dest = fs.readFileSync(_source);
                    } catch (error) {
                        callback(error);
                        return;
                    }
                    dbx.filesUpload({
                            contents: dest,
                            path: path + '/' + name,
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
