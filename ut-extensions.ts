import { EventEmitter }     from "events";
import { Hash, createHash } from "crypto";
import * as _               from "lodash";


const debug          = require("debug")("ut-extensions"),
      bencode        = require("bencode"),
      compact2string = require("compact2string"),
      string2compact = require("string2compact"),
      PACKET_SIZE    = 16384,
      UT_PEX         = 1,
      UT_METADATA    = 2;


interface File {
  path:   string;
  name:   string;
  length: number;
  offset: number;
}

interface Info {
  name:           string;
  length:         number;
  "piece length": number;
  pieces:         Array<string>;
}

interface Torrent {
  info:            Info;
  name:            string;
  files:           Array<File>;
  length:          number;
  pieceLength:     number;
  lastPieceLength: number;
  pieces:          Array<string>;
}

// BEP_0009
class UTmetadata extends EventEmitter {
  _debugId:      number;
  metaDataSize:  number;
  infoHash:      string;
  torrentInfo:   Array<Buffer>;
  pieceHash:     Hash;
  piece_count:   number;
  next_piece:    number;
  pieces:        Array<Buffer>;

  constructor (metaDataSize: number, infoHash: string, torrentInfo?: Info) {
    super();
    if (!(this instanceof UTmetadata))
      return new UTmetadata(metaDataSize, infoHash, torrentInfo);
    const self = this;

    self._debugId = ~~((Math.random() * 100000) + 1);

    self.metaDataSize  = metaDataSize;
    self.infoHash      = infoHash;
    self.torrentInfo   = (torrentInfo) ? self.parseInfo(torrentInfo) : null;
    self.pieceHash     = createHash("sha1");
    self.piece_count   = (self.metaDataSize) ? Math.ceil(metaDataSize / PACKET_SIZE) : 1;
    self.next_piece    = 0;
    self.pieces        = Array.apply(null, Array(self.piece_count));

    self._debug("UT_metadata instance created");
  }

  parseInfo(torrentInfo: Info): Array<Buffer> {
    let info   = bencode.encode(torrentInfo);
    let result = [];
    for (let i = 0; i < info.length; i += PACKET_SIZE) {
      result.push(info.slice(i, i + PACKET_SIZE));
    }
    return result;
  }

  prepHandshake() {
    this._debug("prepare meta handshake");
    let msg = { "m": { "ut_metadata": 3 }, "metadata_size": this.metaDataSize };
    msg     = bencode.encode(msg);
    return msg;
  }

  _message (payload: Buffer) {
    const self       = this;
    let str          = payload.toString(),
        trailerIndex = str.indexOf("ee") + 2,
        dict         = bencode.decode( str ),
        trailer      = payload.slice(trailerIndex);

    switch (dict.msg_type) {
      case 0:
        // REQUEST {'msg_type': 0, 'piece': 0}
        this._debug("Meta request recieved");
        if (!self.torrentInfo) {
          let msg = { "msg_type": 2, "piece": dict.piece };
          msg     = bencode.encode(msg);
          self.emit("meta_r", msg);
        } else {
          let msg     = { "msg_type": 1, "piece": dict.piece };
          let msgBuf  = bencode.encode(msg);
          let trailer = self.torrentInfo[dict.piece];
          let buf     = Buffer.concat([msgBuf, trailer]);
          self.emit("meta_r", buf);
        }
        break;
      case 1:
        // RESPONCE {'msg_type': 1, 'piece': 0}
        this._debug("Meta responce recieved");
        self.pieces[dict.piece] = trailer;
        // Check that we have all the pieces
        if ( ++self.next_piece === self.piece_count ) {
          // update the hash
          self.pieces.forEach((piece) => { self.pieceHash.update(trailer); });
          // Check that the hash matches the infoHash we started with
          if ( self.pieceHash.digest("hex") === self.infoHash ) {
            // Parse the metadata and send it off.
            let torrent = parseMetaData( Buffer.concat(self.pieces) );
            self.emit("metadata", torrent);
          } else {
            // Bad torrent data; try again
            self.pieceHash  = createHash("sha1");
            self.next_piece = 0;
            self.emit("next", self.next_piece);
          }
        } else {
          // Otherwise tell the engine we need more data
          self.emit("next", self.next_piece);
        }
        break;
      case 2:
        // REJECT {'msg_type': 2, 'piece': 0}
        this._debug("Meta reject recieved");
        break;
      default:

    }
  }

  _debug = (...args: any[]) => {
    args[0] = "[META-" + this._debugId + "] " + args[0];
    debug.apply(null, args);
  }
}

// BEP_0011

/*********************************************************************
 * PEX messages are bencoded dictionaries with the following keys:
 * 'added'     : array of peers met since last PEX message
 * 'added.f'   : array of flags per peer
 * '0x01'      : peer prefers encryption
 * '0x02'      : peer is seeder
 * '0x04'      : supports uTP
 * '0x08'      : peer indicated ut_holepunch support in extension handshake
 * '0x10'      : outgoing connection, peer is reachable
 * 'added6'    : ipv6 version of 'added'
 * 'added6.f'  : ipv6 version of 'added.f'
 * 'dropped'   : array of peers locally dropped from swarm since last PEX message
 * 'dropped6'  : ipv6 version of 'dropped'
 *********************************************************************/

interface Peers {
  "added": Buffer;
  "added.f": Buffer;
  "added6": Buffer;
  "added6.f": Buffer;
  "dropped": Buffer;
  "dropped6": Buffer;
}

class UTpex extends EventEmitter {
  _debugId: number;
  ID:       Array<string>;
  added:    Array<string>;
  added6:   Array<string>;
  dropped:  Array<string>;
  dropped6: Array<string>;
  constructor () {
    super();
    if (!(this instanceof UTpex))
      return new UTpex();
    const self = this;

    self._debugId = ~~((Math.random() * 100000) + 1);
    self.ID       = null;

    self.added    = [];
    self.added6   = [];
    self.dropped  = [];
    self.dropped6 = [];

    self._debug("UTpex instance created");
  }

  _message (payload: Buffer) {
    const self = this;
    let dict   = null;
    try {
      dict = bencode.decode( payload );
    } catch (e) {
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

  myID(id: string) {
    this.ID = (id.split(":")[0]).split(".");
  }

  compactPeers(emitType: string, peerDict: Peers) {
    let peers = compact2string.multi( peerDict );
    if (this.ID)
      peers   = CanonicalPeerPriority(this.ID, peers);
    this.emit(emitType, peers);
  }

  addAll(addPeers: Array<string>, addPeers6: Array<string>, dropPeers: Array<string>, dropPeers6: Array<string>) {
    this.added    = this.partition(this.added, addPeers);
    this.added6   = this.partition(this.added6, addPeers6);
    this.dropped  = this.partition(this.dropped, dropPeers);
    this.dropped6 = this.partition(this.dropped6, dropPeers6);
  }

  addPeer(peers: Array<string>) {
    this.added = this.partition(this.added, peers);
  }
  addPeer6(peers: Array<string>) {
    this.added6 = this.partition(this.added6, peers);
  }

  dropPeer(peers: Array<string>) {
    this.dropped = this.partition(this.dropped, peers);
  }
  dropPeer6(peers: Array<string>) {
    this.dropped6 = this.partition(this.dropped6, peers);
  }

  partition(which: Array<string>, peers: Array<string>): Array<string> {
    which.push.apply(which, peers);

    let arr = _.uniq(which);
    while (arr.length > 50) {
      arr.shift();
    }
    return arr;
  }

  prepMessage(): Peers {
    this._debug("Pex prepare message");
    const self = this;
    let msg = {
      "added":    string2compact(self.added),
      "added.f":  Buffer.concat( self.added.map(() => { return new Buffer([0x02]); }) ),
      "added6":   string2compact(self.added6),
      "added6.f": Buffer.concat( self.added6.map(() => { return new Buffer([0x02]); }) ),
      "dropped":  string2compact(self.dropped),
      "dropped6": string2compact(self.dropped6)
    };

    let ben = bencode.encode(msg);

    return ben;
  }

  _debug = (...args: any[]) => {
    args[0] = "[PEX-" + this._debugId + "] " + args[0];
    debug.apply(null, args);
  }
}

// BEP_0040
function CanonicalPeerPriority (myID: Array<string>, peers: Array<string>): Array<string> {
  let obj    = {};
  let result = [];
  peers.forEach((peer) => {
    let p = (peer.split(":")[0]).split(".")[0];
    let dif = parseInt(p, 10) ^ parseInt(myID[0], 10);
    obj[peer] = dif;
  });
  let sorted = Object.keys(obj).sort( function(a, b) { return obj[a] - obj[b]; });
  sorted.forEach((peer) => { result.push(peer); });
  return result;
}

function parseMetaData (data): Torrent {

  let t = bencode.decode(data);

  let torrent = {
    info: t,
    "name": t.name.toString(),
    "files": [],
    "length": null,
    "pieceLength": t["piece length"],
    "lastPieceLength": null,
    "pieces": []
  };

  // Files:
  let length = 0;
  if (t.files) {
    torrent.files = t.files;
    let o         = 0;
    torrent.files = torrent.files.map((file) => {
      length     += file.length;
      file.path   = file.path.toString();
      file.offset = o;
      o          += file.length;
      return file;
    });
    torrent.length = length;
  } else {
    torrent.files = [{
      length: t.length,
      path:   torrent.name,
      name:   torrent.name,
      offset: 0
    }];
    torrent.length = t.length;
  }
  torrent.lastPieceLength = torrent.length % torrent.pieceLength;

  // Pieces:
  let piece = t.pieces.toString("hex");
  for (let i = 0; i < piece.length; i += 40) {
    let p = piece.substring(i, i + 40);
    torrent.pieces.push(p);
  }

  return torrent;
}

export { UTmetadata, UTpex }
