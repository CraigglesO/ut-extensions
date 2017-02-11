import * as test from "blue-tape";
import { UTmetadata, UTpex } from "../ut-extensions";
import { Buffer } from "buffer";

const bencode        = require("bencode"),
      string2compact = require("string2compact"),
      compact2string = require("compact2string");


const magnetLink = "magnet:?xt=urn:btih:74416fe776ca02ca2da20f686fed835e4dcfe84d&dn=Screen+Shot+2017-01-21+at+8.25.15+AM.png&tr=udp%3A%2F%2F0.0.0.0%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com";
// Prepare a test
const torrentFile = { info:
   { length: 99525,
     name: null,
     "piece length": 16384,
     pieces: null,
     private: 0 },
  infoBuffer: null,
  infoHash: "74416fe776ca02ca2da20f686fed835e4dcfe84d",
  infoHashBuffer: null,
  name: "Screen Shot 2017-01-21 at 8.25.15 AM.png",
  private: false,
  created: "2017-01-22T01:11:39.000Z",
  createdBy: "WebTorrent/0097",
  announce:
   [ "udp://0.0.0.0:1337",
     "wss://tracker.btorrent.xyz",
     "wss://tracker.fastcast.nz",
     "wss://tracker.openwebtorrent.com" ],
  urlList: [],
  files:
   [ { path: "Screen Shot 2017-01-21 at 8.25.15 AM.png",
       name: "Screen Shot 2017-01-21 at 8.25.15 AM.png",
       length: 99525,
       offset: 0 } ],
  length: 99525,
  pieceLength: 16384,
  lastPieceLength: 1221,
  pieces:
   [ "4aa0c3fbce71268c4efb56fe4cb1f42226bc5959",
     "26c5f590f88dc560905d2d2c1d4a82db394fae98",
     "c45361a1858c37cfdf77bb716c48fa368f3605af",
     "4d4289c76994ee95b0302b76ca0df2a351a10afc",
     "84eac82d3f383e6c1bb9d5a0c18b5cdbc1b729af",
     "db265f87a7f6047916c30298479cae03c9dceccb",
     "fa2857f4fbeb4d3e9d7d847e4b94c6b418f4fa83" ] };


// Prep the info file
const info = torrentFile.info;
// Prep the buffers:
let pieces = torrentFile.pieces.join("");
let pieceBuf = Buffer.from(pieces, "hex");

let name = torrentFile.name;
let nameBuf = Buffer.from(name);

info.name = nameBuf;
info.pieces = pieceBuf;
// console.log(info["piece length"]);
torrentFile.info = info;
// Use bencoding to encode the whole infohash
torrentFile.infoBuffer = Buffer.from(bencode.encode(info));
torrentFile.infoHashBuffer = Buffer.from(torrentFile.infoHash, "hex");

// console.log("full torrent file:", torrentFile);

const infoBuf = bencode.encode(torrentFile);

const infoLength = infoBuf.length;

// Initial message:
// const message = {
//   m: {
//     ut_metadata: 1,
//     ut_pex: 2
//   },
//   metadata_size: 13143 //infoLength
// };

let message = { "msg_type": 1, "piece": 0 };
const messageBen = bencode.encode(message);

const completeMessage = Buffer.concat([messageBen, infoBuf]);

// ut_metadata tests:
test("ut_metadata testings..", (t) => {
  t.plan(6);

  let ut_metadata = new UTmetadata(infoLength, torrentFile.infoHash);

  ut_metadata.on("metadata", (torrent) => {
    console.log("torrent: ", torrent);
    console.log("info: ", info);
    // t.equal(torrent, info, "Check that the metadata is downloaded and parsed appropriately");
  });

  ut_metadata.on("next", (index) => {
    t.equal(index, 0, "Bad data, so it should try again");
  });

  // Check object is ready to go...
  t.equal(ut_metadata.infoHash, torrentFile.infoHash, "checking proper variable storage");
  t.equal(ut_metadata.metaDataSize, infoLength, "checking proper variable storage");

  // Check the piece count:
  t.equal(ut_metadata.piece_count, 1, "Piece count size");

  // Check array is built:
  t.true(Array.isArray(ut_metadata.pieces), "Piece count size");
  // Check the array is equal to the piece count:
  t.equal(ut_metadata.pieces.length, ut_metadata.piece_count, "Piece count size");

  // Send a message, see if we get a responce:
  ut_metadata._message(completeMessage);

  t.end();

});

test("UT_PEX tests", (t) => {
  t.plan(4);

  let ut_pex = new UTpex();

  ut_pex.myID("76.256.2.70:1337");

  ut_pex.on("pex_added", (peers) => {
    t.true( true, "testing pex_added responce");
    t.equal(JSON.stringify(peers), JSON.stringify([ "65.156.3.75:2000", "100.56.58.99:28525", "10.10.10.5:128" ]), "testing Canonical Peer Priority");
  });

  ut_pex.on("pex_dropped", (peers) => {
    t.true( true, "testing pex_dropped responce");
  });

  let peers = [
    "10.10.10.5:128",
    "100.56.58.99:28525",
    "65.156.3.75:2000"
  ];

  let obj = {
    "added": string2compact(peers),
    "added.f": null,
    "added6": null,
    "added6.f": null,
    "dropped": null,
    "dropped6": null
  };

  ut_pex.addPeer(["10.10.10.5:128"]);
  ut_pex.addPeer(["10.10.10.5:128"]);     // duplicate to test sureity of uniqueness
  ut_pex.addPeer(["100.56.58.99:28525"]);
  ut_pex.addPeer(["65.156.3.75:2000"]);


  let ben = bencode.encode(obj);

  ut_pex._message(ben);

  let msg = ut_pex.prepMessage();

  let ben_msg = bencode.decode(msg);

  t.equal(ben_msg["added.f"].toString("hex"), (new Buffer([0x02, 0x02, 0x02])).toString("hex"), "Correct added.f");

  t.equal(ben_msg["added"].toString("hex"), string2compact(peers).toString("hex"), "Correct added");


  t.end();
});
