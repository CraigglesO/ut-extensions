"use strict";
const events_1 = require("events");
const crypto_1 = require("crypto");
const _ = require("lodash");
const bencode = require("bencode"), compact2string = require("compact2string"), string2compact = require("string2compact"), PACKET_SIZE = 16384, UT_PEX = 1, UT_METADATA = 2;
class UTmetadata extends events_1.EventEmitter {
    constructor(metaDataSize, infoHash, torrentInfo) {
        super();
        if (!(this instanceof UTmetadata))
            return new UTmetadata(metaDataSize, infoHash, torrentInfo);
        const self = this;
        self.metaDataSize = metaDataSize;
        self.infoHash = infoHash;
        self.torrentInfo = (torrentInfo) ? self.parseInfo(torrentInfo) : null;
        self.pieceHash = crypto_1.createHash("sha1");
        self.piece_count = (self.metaDataSize) ? Math.ceil(metaDataSize / PACKET_SIZE) : 1;
        self.next_piece = 0;
        self.pieces = Array.apply(null, Array(self.piece_count));
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
        let msg = { "m": { "ut_metadata": 3 }, "metadata_size": this.metaDataSize };
        msg = bencode.encode(msg);
        return msg;
    }
    _message(payload) {
        const self = this;
        let str = payload.toString(), trailerIndex = str.indexOf("ee") + 2, dict = bencode.decode(str), trailer = payload.slice(trailerIndex);
        switch (dict.msg_type) {
            case 0:
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
                self.pieces[dict.piece] = trailer;
                self.pieceHash.update(trailer);
                if (++self.next_piece === self.piece_count) {
                    if (self.pieceHash.digest("hex") === self.infoHash) {
                        let torrent = parseMetaData(Buffer.concat(self.pieces));
                        self.emit("metadata", torrent);
                    }
                    else {
                        self.next_piece = 0;
                        self.emit("next", self.next_piece);
                    }
                }
                else {
                    self.emit("next", self.next_piece);
                }
                break;
            case 2:
                break;
            default:
        }
    }
}
exports.UTmetadata = UTmetadata;
class UTpex extends events_1.EventEmitter {
    constructor() {
        super();
        if (!(this instanceof UTpex))
            return new UTpex();
        const self = this;
        self.ID = null;
        self.added = [];
        self.added6 = [];
        self.dropped = [];
        self.dropped6 = [];
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
            self.compactPeers("pex_added", dict.added);
        }
        if (dict.added6) {
            self.compactPeers("pex_added6", dict.added6);
        }
        if (dict.dropped) {
            self.compactPeers("pex_dropped", dict.dropped);
        }
        if (dict.dropped6) {
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
    addPeer(peers) {
        this.added.push.apply(this.added, peers);
        this.added = this.cleanup(this.added);
    }
    addPeer6(peers) {
        this.added6.push.apply(this.added6, peers);
        this.added6 = this.cleanup(this.added6);
    }
    dropPeer(peers) {
        this.dropped.push.apply(this.dropped, peers);
        this.dropped = this.cleanup(this.dropped);
    }
    dropPeer6(peers) {
        this.dropped6.push.apply(this.dropped, peers);
        this.dropped6 = this.cleanup(this.dropped6);
    }
    cleanup(peers) {
        let arr = _.uniq(peers);
        while (arr.length > 50) {
            arr.shift();
        }
        return arr;
    }
    prepMessage() {
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
        let dif = parseInt(p) ^ parseInt(myID[0]);
        obj[peer] = dif;
    });
    let sorted = Object.keys(obj).sort(function (a, b) { return obj[a] - obj[b]; });
    sorted.forEach((peer) => { result.push(peer); });
    return result;
}
function parseMetaData(data) {
    let t = bencode.decode(data);
    let torrent = {
        info: {
            "name": t.name,
            "piece length": t["piece length"],
            "pieces": t.pieces
        },
        "name": t.name.toString(),
        "files": [],
        "length": null,
        "pieceLength": t["piece length"],
        "lastPieceLength": null,
        "pieces": []
    };
    let length = 0;
    if (t.files) {
        torrent.files = t.files;
        let o = 0;
        torrent.files = torrent.files.map((file) => {
            length += file.length;
            file.path = file.path.toString();
            file.offset = o;
            o += file.length;
            return file;
        });
        torrent.length = length;
    }
    else {
        torrent.files = [{
                length: t.length,
                path: torrent.name,
                name: torrent.name,
                offset: 0
            }];
        torrent.length = t.length;
    }
    torrent.lastPieceLength = torrent.length % torrent.pieceLength;
    let piece = t.pieces.toString("hex");
    for (let i = 0; i < piece.length; i += 40) {
        let p = piece.substring(i, i + 40);
        torrent.pieces.push(p);
    }
    return torrent;
}
