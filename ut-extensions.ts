import { EventEmitter } from "events";
import { Hash, createHash } from "crypto";


const bencode        = require("bencode"),
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

interface Torrent {
  info: {
    name:           string
    "piece length": number
    pieces:         Array<string>
  };
  name:            string;
  files:           Array<File>;
  length:          number;
  pieceLength:     number;
  lastPieceLength: number;
  pieces:          Array<string>;
}

// BEP_0009
class UTmetadata extends EventEmitter {
  metaDataSize:  number;
  infoHash:      string;
  pieceHash:     Hash;
  piece_count:   number;
  next_piece:    number;
  pieces:        Array<Buffer>;

  constructor (metaDataSize: number, infoHash: string) {
    super();
    if (!(this instanceof UTmetadata))
      return new UTmetadata(metaDataSize, infoHash);
    const self = this;

    self.metaDataSize  = metaDataSize;
    self.infoHash      = infoHash;
    self.pieceHash     = createHash("sha1");
    self.piece_count   = (self.metaDataSize) ? Math.ceil(metaDataSize / PACKET_SIZE) : 1;
    self.next_piece    = 0;
    self.pieces        = Array.apply(null, Array(self.piece_count));

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
        break;
      case 1:
        // RESPONCE {'msg_type': 1, 'piece': 0}
        self.pieces[dict.piece] = trailer;
        // update the hash
        self.pieceHash.update(trailer);
        // Check that we have all the pieces
        if ( ++self.next_piece === self.piece_count ) {
          // Check that the hash matches the infoHash we started with
          if ( self.pieceHash.digest("hex") === self.infoHash ) {
            // Parse the metadata and send it off.
            let torrent = parseMetaData( Buffer.concat(self.pieces) );
            self.emit("metadata", torrent);
          } else {
            // Bad torrent data; try again
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
        break;
      default:

    }
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

    self.ID     = null;

    self.added    = [];
    self.added6   = [];
    self.dropped  = [];
    self.dropped6 = [];
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

  myID(id: string) {
    this.ID = (id.split(":")[0]).split(".");
  }

  compactPeers(emitType: string, peerDict: Peers) {
    let peers = compact2string.multi( peerDict );
    if (this.ID)
      peers   = CanonicalPeerPriority(this.ID, peers);
    this.emit(emitType, peers);
  }

  addPeer (peers: Array<string>) {
    let p = string2compact(peers);
    this.added.push(p);
  }
  addPeer6 (peers: Array<string>) {
    let p = string2compact(peers);
    this.added6.push(p);
  }

  dropPeer (peers: Array<string>) {
    let p = string2compact(peers);
    this.dropped.push(p);
  }
  dropPeer6 (peers: Array<string>) {
    let p = string2compact(peers);
    this.dropped6.push(p);
  }
}

// BEP_0040
function CanonicalPeerPriority (myID: Array<string>, peers: Array<string>): Array<string> {
  let obj    = {};
  let result = [];
  peers.forEach((peer) => {
    let p = (peer.split(":")[0]).split(".")[0];
    let dif = parseInt(p) ^ parseInt(myID[0]);
    obj[peer] = dif;
  });
  let sorted = Object.keys(obj).sort( function(a, b) { return obj[a] - obj[b]; });
  sorted.forEach((peer) => { result.push(peer); });
  return result;
}

function parseMetaData (data): Torrent {

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
