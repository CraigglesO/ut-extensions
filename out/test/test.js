"use strict";
const test = require("blue-tape");
const ut_extensions_1 = require("../ut-extensions");
const buffer_1 = require("buffer");
const bencode = require('bencode');
const magnetLink = 'magnet:?xt=urn:btih:74416fe776ca02ca2da20f686fed835e4dcfe84d&dn=Screen+Shot+2017-01-21+at+8.25.15+AM.png&tr=udp%3A%2F%2F0.0.0.0%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com';
const torrentFile = { info: { length: 99525,
        name: null,
        'piece length': 16384,
        pieces: null,
        private: 0 },
    infoBuffer: null,
    infoHash: '74416fe776ca02ca2da20f686fed835e4dcfe84d',
    infoHashBuffer: null,
    name: 'Screen Shot 2017-01-21 at 8.25.15 AM.png',
    private: false,
    created: '2017-01-22T01:11:39.000Z',
    createdBy: 'WebTorrent/0097',
    announce: ['udp://0.0.0.0:1337',
        'wss://tracker.btorrent.xyz',
        'wss://tracker.fastcast.nz',
        'wss://tracker.openwebtorrent.com'],
    urlList: [],
    files: [{ path: 'Screen Shot 2017-01-21 at 8.25.15 AM.png',
            name: 'Screen Shot 2017-01-21 at 8.25.15 AM.png',
            length: 99525,
            offset: 0 }],
    length: 99525,
    pieceLength: 16384,
    lastPieceLength: 1221,
    pieces: ['4aa0c3fbce71268c4efb56fe4cb1f42226bc5959',
        '26c5f590f88dc560905d2d2c1d4a82db394fae98',
        'c45361a1858c37cfdf77bb716c48fa368f3605af',
        '4d4289c76994ee95b0302b76ca0df2a351a10afc',
        '84eac82d3f383e6c1bb9d5a0c18b5cdbc1b729af',
        'db265f87a7f6047916c30298479cae03c9dceccb',
        'fa2857f4fbeb4d3e9d7d847e4b94c6b418f4fa83'] };
const info = torrentFile.info;
let pieces = torrentFile.pieces.join('');
console.log('pieces: ', pieces);
let pieceBuf = buffer_1.Buffer.from(pieces, "hex");
console.log('pieceBuf: ', pieceBuf);
let name = torrentFile.name;
let nameBuf = buffer_1.Buffer.from(name);
console.log('nameBuf: ', nameBuf);
info.name = nameBuf;
info.pieces = pieceBuf;
torrentFile.infoBuffer = buffer_1.Buffer.from(bencode.encode(info));
console.log('infoBuffer', torrentFile.infoBuffer);
torrentFile.infoHashBuffer = buffer_1.Buffer.from(torrentFile.infoHash, "hex");
console.log('infoHashBuffer', torrentFile.infoHashBuffer);
const infoBuf = bencode.encode(torrentFile);
const infoLength = infoBuf.length;
let message = { 'msg_type': 1, 'piece': 0 };
const messageBen = bencode.encode(message);
const completeMessage = buffer_1.Buffer.concat([messageBen, infoBuf]);
console.log(completeMessage);
console.log(messageBen);
console.log(infoBuf);
test("ut_metadata testings..", (t) => {
    t.plan(6);
    let ut_metadata = new ut_extensions_1.UTmetadata(infoLength, torrentFile.infoHash);
    ut_metadata.on('metadata', (torrent) => {
        console.log('torrent: ', torrent);
        console.log('info: ', info);
        t.equal(torrent, info, 'Check that the metadata is downloaded and parsed appropriately');
    });
    t.equal(ut_metadata.infoHash, torrentFile.infoHash, 'checking proper variable storage');
    t.equal(ut_metadata.metaDataSize, infoLength, 'checking proper variable storage');
    t.equal(ut_metadata.piece_count, 1, 'Piece count size');
    t.true(Array.isArray(ut_metadata.pieces), 'Piece count size');
    t.equal(ut_metadata.pieces.length, ut_metadata.piece_count, 'Piece count size');
    ut_metadata._message(completeMessage);
    setTimeout(() => {
        t.end();
    }, 2000);
});
