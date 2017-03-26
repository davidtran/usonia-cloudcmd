const ponse = require('ponse');
const check = require('checkup');
const googleProvider = require('./googledrive');
const dropboxProvider = require('./dropbox');
const requestIp = require('request-ip');
var ipaddr = require('ipaddr.js');
module.exports = (request, response, next) => {
    check
        .type('next', next, 'function')
        .check({
            request,
            response,
        });

    const apiURL = '/provider';
    const name = ponse.getPathName(request);
    const regExp = RegExp('^' + apiURL);
    const is = regExp.test(name);

    if (!is)
        return next();

    const params = {
        request,
        response,
        name: name.replace(apiURL, '') || '/',
    };
    var ip = requestIp.getClientIp(request);
    ip = ipaddr.process(ip).toString();
    if (ip = '::1') {
        ip = '127.0.0.1';
    }
    sendData(params, ip);
};

function sendData(params, ip) {
    const p = params;

    switch (p.request.method) {
        case 'GET':
            onGET(params, ip, function (err, data, type) {
                if (err) {
                    p.response.end(err.toString());
                } else {
                    if (type) {
                        switch (type) {
                            case 'redirect':
                                var success = data;
                                var dataResponse = `
                                    <html><body>NODE<script>
                                    let success = ${success};
                                    window.parent.opener.postMessage({
                                        loginSuccess: true
                                    }, '*');
                                    window.close(); 
                                    </script></body></html>`;
                                p.response.writeHead(200, {
                                    'Content-Type': 'text/html'
                                });
                                p.response.end(dataResponse);
                                break;
                            case 'image':
                                p.response.writeHead(200, {
                                    'Content-Type': 'image/png'
                                });
                                p.response.end(data, 'binary');
                                break;
                            default:
                                p.response.end();
                                break;
                        }

                    } else {
                        p.response.json(data);
                    }
                }
            });
            break;
        case 'POST':
            onPOST(params, ip, function (err, data) {
                if (err) {
                    p.response.end(err.toString());
                } else {
                    p.response.json(data);
                }
            });
            break;
        default:
            p.response.end('Not Found');
            break;
    }
}

function onGET(params, ip, callback) {
    var name = params.name;
    var listParams = name.split('/');
    var providerName = listParams[1];
    var _params = {
        request: params.request,
        response: params.response,
        name: listParams[2] || '',
    };
    switch (providerName) {
        case 'google':
            googleProvider.refreshToken(_params, ip, function (error) {
                googleProvider.onGET(_params, ip, callback);
            });
            break;
        case 'dropbox':
            dropboxProvider.onGET(_params, ip, callback);
            break;
        default:
            callback({
                message: 'Not Found'
            });
            break;
    }
}

function onPOST(params, ip, callback) {
    var name = params.name;
    var listParams = name.split('/');
    var providerName = listParams[1];
    var _params = {
        request: params.request,
        response: params.response,
        name: listParams[2] || '',
    };
    switch (providerName) {
        case 'google':
            googleProvider.refreshToken(_params, ip, function (error) {
                googleProvider.onPOST(_params, ip, callback);
            })
            break;
        case 'dropbox':
            dropboxProvider.onPOST(_params, ip, callback);
            break;
        default:
            callback({
                message: 'Not Found'
            });
            break;
    }
}
