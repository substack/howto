#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var minimist = require('minimist');
var defined = require('defined');
var pager = require('default-pager');
var editor = require('editor');
var osenv = require('osenv');
var howto = require('../');
var mserver = require('../lib/server.js');
var http = require('http');
var hyperquest = require('hyperquest');

module.exports = function (level, args, opts) {
    if (!opts) opts = {};
    var $0 = opts.$0 || 'howto';
    
    var argv = minimist(args, {
        alias: { h: 'help', d: 'datadir', p: 'port' }
    });
    
    if (argv.help || argv._[0] === 'help') {
        usage(0);
    }
    else if (argv._[0] === 'server') {
        var server = http.createServer(mserver($0, gethdb()));
        server.on('listening', function () {
            console.error('listening on :' + server.address().port);
        });
        server.listen(argv.port);
    }
    else if (argv._[0] === 'read') {
        var hdb = gethdb();
        var r = hdb.createReadStream(argv._[1]);
        r.on('end', function () { hdb.close() });
        r.pipe(process.stdout);
    }
    else if (argv._[0] === 'browse') {
        var hdb = gethdb();
        var r = hdb.createReadStream(argv._[1]);
        r.on('end', function () { hdb.close() });
        r.pipe(process.stdout);
    }
    else if (argv._[0] === 'show') {
        var hdb = gethdb();
        var r = hdb.createReadStream(argv._[1]);
        r.pipe(pager(function () { hdb.close() }));
    }
    else if (argv._[0] === 'edit') {
        var hash = argv._[1];
        if (!hash) return error('usage: ' + $0 + ' edit HASH');
        var tmpfile = path.join(osenv.tmpdir(), $0 + '-' + Math.random());
        
        var hdb = gethdb();
        var w = fs.createWriteStream(tmpfile);
        var r = hdb.createReadStream(hash);
        w.on('close', function () {
            editor(tmpfile, function (code, sig) {
                if (code !== 0) return process.exit(code);
                
                var opts = { prev: hash }
                var w = hdb.createWriteStream(opts, function (err, key) {
                    if (err) return error(err)
                    console.log(key);
                    hdb.close();
                });
                fs.createReadStream(tmpfile).pipe(w);
            });
        });
        r.pipe(w);
    }
    else if (argv._[0] === 'sync' || argv._[0] === 'pull' || argv._[0] === 'push') {
        var mode = argv._[0];
        var hdb = gethdb();
        var uri = argv._[1];
        var d = hdb.replicate({ mode: mode }, function (err) {
            if (err) error(err)
            else hdb.close()
        });
        if (uri) {
            var href = uri.replace(/\/+$/, '') + '/replicate/' + mode;
            var hq = hyperquest.post(href);
            d.pipe(hq).pipe(d);
        }
        else process.stdin.pipe(d).pipe(process.stdout);
    }
    else if (argv._[0] === 'create') {
        var hdb = gethdb();
        var w = hdb.createWriteStream(argv, function (err, hash) {
            if (err) error(err)
            else console.log(hash)
            hdb.close();
        });
        process.stdin.pipe(w);
    }
    else if (argv._[0] === 'search') {
        var hdb = gethdb();
        var r = hdb.search(argv._.slice(1));
        r.on('data', function (row) {
            console.log('# ' + row.key);
            console.log('hash: ' + row.hash + '\n');
        });
        r.on('end', function () { hdb.close() });
    }
    else if (argv._[0] === 'recent') {
        var hdb = gethdb();
        var r = hdb.recent();
        r.on('data', function (row) {
            console.log('# ' + row.meta.key );
            console.log('hash: ' + row.hash);
            console.log('tags:', row.meta.tags);
            console.log('date: ' + new Date(row.meta.time));
            console.log();
        });
        r.on('end', function () { hdb.close() });
    }
    else if (argv._[0] === 'heads') {
        var key = argv._.slice(1).join(' ');
        if (!key) error('usage: ' + $0 + ' heads KEY');
        var hdb = gethdb();
        var r = hdb.heads(key);
        r.on('data', function (row) {
            console.log(row.hash);
        });
        r.on('end', function () { hdb.close() });
    }
    else if (argv._[0] === 'keys') {
        var hdb = gethdb();
        var r = hdb.keys();
        r.on('data', function (row) {
            console.log(row.key);
        });
        r.on('end', function () { hdb.close() });
    }
    else usage(1);
    
    function usage (code) {
        var file = path.join(__dirname, '../bin/usage.txt');
        fs.readFile(file, function (err, src) {
            if (err) return error(err);
            console.log(src.toString('utf8').replace(/\$0/g, $0));
        });
    }
    
    function gethdb () {
        var dir = getdir();
        var blobdir = path.join(dir, 'blob');
        mkdirp.sync(blobdir);
        
        var db = level(path.join(dir, 'db'));
        var mdb = howto(db, { dir: blobdir });
        mdb.close = function () { db.close() };
        return mdb;
    }
    
    function getdir () {
        var dir = defined(
            opts.datadir,
            argv.datadir,
            process.env.HOWTO_PATH
        );
        if (!dir) {
            dir = defined(process.env.HOME, process.env.USERDIR);
            if (dir) dir = path.join(dir, '.config', $0);
        }
        if (!dir) dir = process.cwd();
        return dir;
    }
}

function error (err) {
    console.error(err);
    process.exit(1);
}
