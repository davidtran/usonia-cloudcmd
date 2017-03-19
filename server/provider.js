const ponse = require('ponse');
const check = require('checkup');
const googleProvider = require('./googledrive');
const dropboxProvider = require('./dropbox');

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

    sendData(params);
};

function sendData(params) {
    const p = params;

    switch (p.request.method) {
        case 'GET':
            onGET(params, function (err, data, redirect) {
                if (err) {
                    p.response.end(err.toString());
                } else {
                    if(redirect){
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
                    }else{
                        p.response.json(data);
                    }
                }
            });
            break;
        case 'POST':
            onPOST(params, function (err, data) {
                if(err){
                    p.response.end(err.toString());
                }else{
                    p.response.json(data);
                }
            })
            break;
        default:
            p.response.end('Not Found');
            break;
    }
}

function onGET(params, callback) {
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
            googleProvider.onGET(_params, callback);
            break;
        case 'dropbox':
            dropboxProvider.onGET(_params, callback);
            break;
        default:
            callback({
                message: 'Not Found'
            });
            break;
    }
}

function onPOST(params, callback) {
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
            googleProvider.onPOST(_params, callback);
            break;
        case 'dropbox':
            callback({
                message: 'Dropbox'
            });
            break;
        default:
            callback({
                message: 'Not Found'
            });
            break;
    }
}
