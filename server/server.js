'use strict';

const DIR_SERVER = './';
const cloudcmd = require(DIR_SERVER + 'cloudcmd');

const exit = require(DIR_SERVER + 'exit');
const config = require(DIR_SERVER + 'config');
const prefixer = require(DIR_SERVER + 'prefixer');

const http = require('http');
const opn = require('opn');
const express = require('express');
const io = require('socket.io');
const squad = require('squad');
const apart = require('apart');
var cors = require('cors');
require('dotenv').config();
var bodyParser = require('body-parser');

const tryRequire = require('tryrequire');
const logger = tryRequire('morgan');

const prefix = squad(prefixer, apart(config, 'prefix'));
const os = require('os');
// const pty = require('node-pty');

module.exports = (options) => {
    const port = process.env.VCAP_APP_PORT || /* cloudfoundry */
        process.env.PORT || /* c9           */
        config('port');

    const ip = process.env.IP || /* c9           */
        config('ip') ||
        '0.0.0.0';

    const app = express();
    var expressWs = require('express-ws')(app);
    const server = http.createServer(app);
    app.use(bodyParser.json());
    if (logger)
        app.use(logger('dev'));
    
    var whitelist = [process.env.SITE_URL, process.env.API_URL, process.env.HEROKU_PAGE, process.env.REACT_APP_URL];
    var corsOptionsDelegate = function (req, callback) {
        var corsOptions;
        if (whitelist.indexOf(req.header('Origin')) !== -1) {
            corsOptions = {
                origin: true
            }; // reflect (enable) the requested origin in the CORS response
        } else {
            corsOptions = {
                origin: false
            }; // disable CORS for this request
        }
        callback(null, corsOptions); // callback expects two parameters: error and options
    };

    app.use(cors(corsOptionsDelegate), function (req, res, next) {
        next();
    });

    app.use(cloudcmd({
        config: options,
        socket: io(server, {
            path: prefix() + '/socket.io'
        })
    }));

    // app.post('/terminals', function (req, res) {
    //     var cols = parseInt(req.query.cols),
    //         rows = parseInt(req.query.rows),
    //         term = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
    //             name: 'xterm-color',
    //             cols: cols || 80,
    //             rows: rows || 24,
    //             cwd: process.env.PWD,
    //             env: process.env
    //         });

    //     console.log('Created terminal with PID: ' + term.pid);
    //     terminals[term.pid] = term;
    //     logs[term.pid] = '';
    //     term.on('data', function(data) {
    //         logs[term.pid] += data;
    //     });
    //     res.send(term.pid.toString());
    //     res.end();
    //     });

    //     app.post('/terminals/:pid/size', function (req, res) {
    //     var pid = parseInt(req.params.pid),
    //         cols = parseInt(req.query.cols),
    //         rows = parseInt(req.query.rows),
    //         term = terminals[pid];

    //     term.resize(cols, rows);
    //     console.log('Resized terminal ' + pid + ' to ' + cols + ' cols and ' + rows + ' rows.');
    //     res.end();
    //     });

    //     app.ws('/terminals/:pid', function (ws, req) {
    //     var term = terminals[parseInt(req.params.pid)];
    //     console.log('Connected to terminal ' + term.pid);
    //     ws.send(logs[term.pid]);

    //     term.on('data', function(data) {
    //         try {
    //         ws.send(data);
    //         } catch (ex) {
    //         // The WebSocket is not open, ignore
    //         }
    //     });
    //     ws.on('message', function(msg) {
    //         term.write(msg);
    //     });
    //     ws.on('close', function () {
    //         term.kill();
    //         console.log('Closed terminal ' + term.pid);
    //         // Clean things up
    //         delete terminals[term.pid];
    //         delete logs[term.pid];
    //     });
    // });

    if (port < 0 || port > 65535)
        exit('cloudcmd --port: %s', 'port number could be 1..65535, 0 means any available port');

    server.listen(port, ip, () => {
        const host = config('ip') || 'localhost';
        const port0 = port || server.address().port;
        const url = `http://${host}:${port0}${prefix()}/`;

        console.log('url:', url);

        if (!config('open'))
            return;

        opn(url);
    });

    server.on('error', error => {
        exit('cloudcmd --port: %s', error.message);
    });
};
