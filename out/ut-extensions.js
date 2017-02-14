"use strict";
const events_1 = require("events");
const crypto_1 = require("crypto");
const _ = require("lodash");
const torrent_parser_1 = require("torrent-parser");
const debug = require("debug")("ut-extensions"), bencode = require("bencode"), compact2string = require("compact2string"), string2compact = require("string2compact"), PACKET_SIZE = 16384, UT_PEX = 1, UT_METADATA = 2;
class UTmetadata extends events_1.EventEmitter {
    constructor(metaDataSize, infoHash, torrentInfo) {
        super();
        this._debug = (...args) => {
            args[0] = "[META-" + this._debugId + "] " + args[0];
            debug.apply(null, args);
        };
        if (!(this instanceof UTmetadata))
            return new UTmetadata(metaDataSize, infoHash, torrentInfo);
        const self = this;
        self._debugId = ~~((Math.random() * 100000) + 1);
        self.metaDataSize = metaDataSize;
        self.infoHash = infoHash;
        self.torrentInfo = (torrentInfo) ? self.parseInfo(torrentInfo) : null;
        self.pieceHash = crypto_1.createHash("sha1");
        self.piece_count = (self.metaDataSize) ? Math.ceil(metaDataSize / PACKET_SIZE) : 1;
        self.next_piece = 0;
        self.pieces = Array.apply(null, Array(self.piece_count));
        self._debug("UT_metadata instance created");
    }
    parseInfo(torrentInfo) {
        let info = bencode.encode(torrentInfo);
        let result = [];
        for (let i = 0; i < info.length; i += PACKET_SIZE) {
            result.push(info.slice(i, i + PACKET_SIZE));
        }
        return result;
    }
    prepHandshake() {
        this._debug("prepare meta handshake");
        let msg = { "m": { "ut_metadata": 3 }, "metadata_size": this.metaDataSize };
        msg = bencode.encode(msg);
        return msg;
    }
    _message(payload) {
        const self = this;
        let str = payload.toString(), trailerIndex = str.indexOf("ee") + 2, dict = bencode.decode(str), trailer = payload.slice(trailerIndex);
        switch (dict.msg_type) {
            case 0:
                this._debug("Meta request recieved");
                if (!self.torrentInfo) {
                    let msg = { "msg_type": 2, "piece": dict.piece };
                    msg = bencode.encode(msg);
                    self.emit("meta_r", msg);
                }
                else {
                    let msg = { "msg_type": 1, "piece": dict.piece };
                    let msgBuf = bencode.encode(msg);
                    let trailer = self.torrentInfo[dict.piece];
                    let buf = Buffer.concat([msgBuf, trailer]);
                    self.emit("meta_r", buf);
                }
                break;
            case 1:
                this._debug("Meta responce recieved");
                self.pieces[dict.piece] = trailer;
                if (++self.next_piece === self.piece_count) {
                    self.pieces.forEach((piece) => { self.pieceHash.update(piece); });
                    if (self.pieceHash.digest("hex") === self.infoHash) {
                        let torrent = torrent_parser_1.parseInfo(Buffer.concat(self.pieces));
                        self.emit("metadata", torrent);
                    }
                    else {
                        self.pieceHash = crypto_1.createHash("sha1");
                        self.next_piece = 0;
                        self.emit("next", self.next_piece);
                    }
                }
                else {
                    self.emit("next", self.next_piece);
                }
                break;
            case 2:
                this._debug("Meta reject recieved");
                break;
            default:
        }
    }
}
exports.UTmetadata = UTmetadata;
class UTpex extends events_1.EventEmitter {
    constructor() {
        super();
        this._debug = (...args) => {
            args[0] = "[PEX-" + this._debugId + "] " + args[0];
            debug.apply(null, args);
        };
        if (!(this instanceof UTpex))
            return new UTpex();
        const self = this;
        self._debugId = ~~((Math.random() * 100000) + 1);
        self.ID = null;
        self.added = [];
        self.added6 = [];
        self.dropped = [];
        self.dropped6 = [];
        self._debug("UTpex instance created");
    }
    _message(payload) {
        const self = this;
        let dict = null;
        try {
            dict = bencode.decode(payload);
        }
        catch (e) {
            return;
        }
        if (dict.added) {
            this._debug("Pex recieved added");
            self.compactPeers("pex_added", dict.added);
        }
        if (dict.added6) {
            this._debug("Pex recieved added6");
            self.compactPeers("pex_added6", dict.added6);
        }
        if (dict.dropped) {
            this._debug("Pex recieved dropped");
            self.compactPeers("pex_dropped", dict.dropped);
        }
        if (dict.dropped6) {
            this._debug("Pex recieved dropped6");
            self.compactPeers("pex_dropped6", dict.dropped6);
        }
    }
    myID(id) {
        this.ID = (id.split(":")[0]).split(".");
    }
    compactPeers(emitType, peerDict) {
        let peers = compact2string.multi(peerDict);
        if (this.ID)
            peers = CanonicalPeerPriority(this.ID, peers);
        this.emit(emitType, peers);
    }
    addAll(addPeers, addPeers6, dropPeers, dropPeers6) {
        this.added = this.partition(this.added, addPeers);
        this.added6 = this.partition(this.added6, addPeers6);
        this.dropped = this.partition(this.dropped, dropPeers);
        this.dropped6 = this.partition(this.dropped6, dropPeers6);
    }
    addPeer(peers) {
        this.added = this.partition(this.added, peers);
    }
    addPeer6(peers) {
        this.added6 = this.partition(this.added6, peers);
    }
    dropPeer(peers) {
        this.dropped = this.partition(this.dropped, peers);
    }
    dropPeer6(peers) {
        this.dropped6 = this.partition(this.dropped6, peers);
    }
    partition(which, peers) {
        which.push.apply(which, peers);
        let arr = _.uniq(which);
        while (arr.length > 50) {
            arr.shift();
        }
        return arr;
    }
    prepMessage() {
        this._debug("Pex prepare message");
        const self = this;
        let msg = {
            "added": string2compact(self.added),
            "added.f": Buffer.concat(self.added.map(() => { return new Buffer([0x02]); })),
            "added6": string2compact(self.added6),
            "added6.f": Buffer.concat(self.added6.map(() => { return new Buffer([0x02]); })),
            "dropped": string2compact(self.dropped),
            "dropped6": string2compact(self.dropped6)
        };
        let ben = bencode.encode(msg);
        return ben;
    }
}
exports.UTpex = UTpex;
function CanonicalPeerPriority(myID, peers) {
    let obj = {};
    let result = [];
    peers.forEach((peer) => {
        let p = (peer.split(":")[0]).split(".")[0];
        let dif = parseInt(p, 10) ^ parseInt(myID[0], 10);
        obj[peer] = dif;
    });
    let sorted = Object.keys(obj).sort(function (a, b) { return obj[a] - obj[b]; });
    sorted.forEach((peer) => { result.push(peer); });
    return result;
}
